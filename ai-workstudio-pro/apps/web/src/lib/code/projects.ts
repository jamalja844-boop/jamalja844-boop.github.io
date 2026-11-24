import { promises as fs } from "node:fs";
import path from "node:path";
import {
  checkSandbox, copyTemplate, forbiddenReason, gitOps, GitError, isInstallCommand, prepareProjectDir, runInSandbox, templateDir, WorkspaceError,
} from "@workstudio/code-execution";
import type { CommandResult, CreateProjectInput } from "@workstudio/shared";
import { withTenant, type TenantContext, type Tx } from "@/lib/db";
import { env, workspaceRoot } from "@/lib/env";
import { ApiError } from "@/lib/api/errors";
import { audit } from "@/lib/security/audit";
import { createPullRequest, getRepo, githubToken, parseGithubRepo } from "@/lib/github/service";

/** Zet fouten uit de werkmap/Git om naar nette API-fouten (400) in plaats van een serverfout. */
export async function codeOp<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof WorkspaceError || e instanceof GitError) throw new ApiError(400, e.message);
    throw e;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Fysieke projectmap: <WORKSPACE_ROOT>/<orgId>/<projectId>. Alleen UUID's, dus geen padinjectie. */
export function projectDir(orgId: string, projectId: string): string {
  if (!UUID.test(orgId) || !UUID.test(projectId)) throw new ApiError(400, "Ongeldig project");
  return path.join(path.resolve(workspaceRoot()), orgId, projectId);
}

export interface ProjectRow {
  id: string;
  name: string;
  description: string;
  source_type: "template" | "git" | "local" | "github";
  source_ref: string;
  status: "preparing" | "ready" | "failed";
  error: string | null;
  created_at: Date;
  last_opened_at: Date | null;
  github_repo: string | null;
  default_branch: string | null;
  last_pr_url: string | null;
}

export async function getProject(tx: Tx, id: string): Promise<ProjectRow> {
  if (!UUID.test(id)) throw new ApiError(404, "Project niet gevonden");
  const [p] = await tx<ProjectRow[]>`select id, name, description, source_type, source_ref, status, error, created_at, last_opened_at, github_repo, default_branch, last_pr_url
    from code_projects where id = ${id}`;
  if (!p) throw new ApiError(404, "Project niet gevonden");
  return p;
}

/** Laadt een project binnen de tenantcontext (RLS) en geeft de veilige projectmap terug. */
export async function openProject(ctx: TenantContext, id: string) {
  const project = await withTenant(ctx, (tx) => getProject(tx, id));
  if (project.status !== "ready") throw new ApiError(409, project.status === "failed" ? `Project kon niet worden voorbereid: ${project.error}` : "Project wordt nog voorbereid");
  return { project, dir: projectDir(ctx.orgId, id) };
}

export async function sandboxStatus() {
  return checkSandbox(env().SANDBOX_IMAGE);
}

export async function createProject(ctx: TenantContext, input: CreateProjectInput) {
  const [row] = await withTenant(ctx, async (tx) => {
    const r = await tx<{ id: string }[]>`
      insert into code_projects (org_id, name, description, source_type, source_ref, status, created_by)
      values (app_org_id(), ${input.name}, ${input.description}, ${input.source.type},
              ${input.source.type === "git" ? input.source.url : input.source.type === "github" ? input.source.repo : input.source.template}, 'preparing', app_user_id())
      returning id`;
    await audit(tx, { action: "code.project_created", targetType: "code_project", targetId: r[0].id, metadata: { source: input.source } });
    return r;
  });
  const dir = projectDir(ctx.orgId, row.id);
  try {
    await fs.mkdir(path.dirname(dir), { recursive: true });
    if (input.source.type === "template") {
      await copyTemplate(templateDir(input.source.template), dir);
      await gitOps.initRepo(dir, "Startproject");
    } else if (input.source.type === "github") {
      // Ook privé-repository's: met het persoonlijke token, dat niet in .git/config terechtkomt.
      const repo = await getRepo(ctx, input.source.repo);
      await gitOps.cloneRepo(`https://github.com/${repo.full_name}.git`, dir, {
        branch: input.source.branch, allowedHosts: ["github.com"], auth: gitOps.authEnv(await githubToken(ctx)),
      });
      await withTenant(ctx, (tx) => tx`update code_projects set github_repo = ${repo.full_name}, default_branch = ${repo.default_branch} where id = ${row.id}`);
    } else {
      await gitOps.cloneRepo(input.source.url, dir, {
        branch: input.source.branch,
        allowedHosts: env().GIT_ALLOWED_HOSTS.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean),
      });
    }
    await prepareProjectDir(dir);
    // Openbare github.com-repository via URL: koppelen zodat pushen/PR later kan.
    const ghRepo = input.source.type === "git" ? parseGithubRepo(input.source.url) : null;
    await withTenant(ctx, (tx) => tx`update code_projects set status = 'ready', error = null, github_repo = coalesce(github_repo, ${ghRepo}) where id = ${row.id}`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await withTenant(ctx, (tx) => tx`update code_projects set status = 'failed', error = ${message.slice(0, 500)} where id = ${row.id}`);
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    throw new ApiError(400, `Project kon niet worden aangemaakt: ${message}`);
  }
  return row.id;
}

export async function deleteProject(ctx: TenantContext, id: string) {
  await withTenant(ctx, async (tx) => {
    const p = await getProject(tx, id);
    await tx`delete from code_projects where id = ${id}`;
    await audit(tx, { action: "code.project_deleted", targetType: "code_project", targetId: id, metadata: { name: p.name } });
  });
  await fs.rm(projectDir(ctx.orgId, id), { recursive: true, force: true });
}

/** Voert een commando uit in de sandbox en legt het vast (audit + geschiedenis). */
export async function runProjectCommand(ctx: TenantContext, projectId: string, command: string, opts: { network: boolean; taskId?: string | null }): Promise<CommandResult & { id: string }> {
  const { dir } = await openProject(ctx, projectId);
  const sb = await sandboxStatus();
  if (!sb.available) throw new ApiError(424, `De code-sandbox is niet beschikbaar: ${sb.reason}`, { setup: { provider: "docker", where: "server" } });
  if (isInstallCommand(command) && !opts.network) {
    throw new ApiError(409, "Dit commando installeert pakketten en heeft netwerktoegang nodig. Bevestig eerst dat netwerk mag worden gebruikt.", { needsNetwork: true });
  }
  const blocked = forbiddenReason(command);
  if (blocked) throw new ApiError(400, blocked);
  const e = env();
  await prepareProjectDir(dir);
  const result = await runInSandbox(dir, command, {
    image: e.SANDBOX_IMAGE, network: opts.network, timeoutMs: e.SANDBOX_TIMEOUT_MS, memoryMb: e.SANDBOX_MEMORY_MB, cpus: e.SANDBOX_CPUS,
    passProxy: e.SANDBOX_PASS_PROXY === "true",
  });
  await prepareProjectDir(dir);
  const [row] = await withTenant(ctx, async (tx) => {
    const r = await tx<{ id: string }[]>`
      insert into code_commands (org_id, project_id, task_id, command, network, exit_code, stdout, stderr, duration_ms, timed_out, created_by)
      values (app_org_id(), ${projectId}, ${opts.taskId ?? null}, ${command}, ${opts.network}, ${result.exitCode}, ${result.stdout}, ${result.stderr},
              ${result.durationMs}, ${result.timedOut}, app_user_id())
      returning id`;
    if (opts.network) await audit(tx, { action: "code.command_network", targetType: "code_project", targetId: projectId, metadata: { command } });
    return r;
  });
  return { ...result, id: row.id };
}

/**
 * Pusht de huidige branch naar GitHub (externe actie: alleen na expliciete bevestiging).
 * Weigert bij niet-gecommitte wijzigingen en – tenzij uitdrukkelijk toegestaan – bij de hoofdbranch.
 */
export async function pushToGithub(ctx: TenantContext, projectId: string, opts: { confirm: boolean; allowDefaultBranch?: boolean }) {
  if (!opts.confirm) throw new ApiError(400, "Bevestig eerst dat je naar GitHub wilt pushen");
  const { project, dir } = await openProject(ctx, projectId);
  const repo = project.github_repo;
  if (!repo) throw new ApiError(409, "Dit project is niet aan een GitHub-repository gekoppeld");
  const st = await gitOps.status(dir);
  if (st.entries.length) throw new ApiError(409, `Er zijn ${st.entries.length} niet-gecommitte wijzigingen. Commit eerst via het Git-tabblad.`);
  const branch = await gitOps.currentBranch(dir);
  const defaultBranch = project.default_branch ?? "main";
  if (branch === defaultBranch && !opts.allowDefaultBranch) {
    throw new ApiError(409, `Je staat op de hoofdbranch "${branch}". Maak een nieuwe branch, of bevestig expliciet dat je naar de hoofdbranch wilt pushen.`, { defaultBranch: true });
  }
  const remote = await gitOps.remoteUrl(dir);
  if (parseGithubRepo(remote) !== repo) throw new ApiError(409, "De remote van dit project wijst niet naar de gekoppelde GitHub-repository");
  const out = await gitOps.pushBranch(dir, branch, { auth: gitOps.authEnv(await githubToken(ctx)) });
  await withTenant(ctx, (tx) => audit(tx, { action: "github.pushed", targetType: "code_project", targetId: projectId, metadata: { repo, branch } }));
  return { repo, branch, defaultBranch, output: out };
}

/** Pusht de branch en opent een pull request (standaard als concept). */
export async function openPullRequest(ctx: TenantContext, projectId: string, input: { title: string; body: string; draft: boolean; confirm: boolean }) {
  const pushed = await pushToGithub(ctx, projectId, { confirm: input.confirm });
  if (pushed.branch === pushed.defaultBranch) throw new ApiError(409, "Een pull request vanaf de hoofdbranch kan niet");
  const pr = await createPullRequest(ctx, pushed.repo, { title: input.title, body: input.body, head: pushed.branch, base: pushed.defaultBranch, draft: input.draft });
  await withTenant(ctx, async (tx) => {
    await tx`update code_projects set last_pr_url = ${pr.html_url} where id = ${projectId}`;
    await audit(tx, { action: "github.pull_request", targetType: "code_project", targetId: projectId, metadata: { repo: pushed.repo, branch: pushed.branch, url: pr.html_url } });
  });
  return { url: pr.html_url, number: pr.number, branch: pushed.branch };
}
