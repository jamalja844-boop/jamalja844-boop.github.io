import { afterAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { checkSandbox, listTree } from "@workstudio/code-execution";
import { parseSlashCommand, type ChatArtifact } from "@workstudio/shared";
import { closeDb, withTenant, type TenantContext } from "@/lib/db";
import { ApiError } from "@/lib/api/errors";
import { loadOrgContext } from "@/lib/auth/context";
import type { ChatEvent, DbMessage } from "@/lib/chat/engine";
import { runChatCommand } from "@/lib/chat/commands";
import { listStyles, saveDocument, updateDocument, writingContext } from "@/lib/writing/service";
import { createProject, deleteProject, getProject, openProject, projectDir, runProjectCommand } from "@/lib/code/projects";
import { startCodeTask } from "@/lib/code/runner";
import { decideApproval } from "@/lib/approvals/service";
import { addMember, createUser, drainJobs, setup } from "./helpers";

afterAll(() => closeDb());

const sandbox = await checkSandbox("node:22-alpine");

async function orgCtx(userId: string, slug: string) {
  const ctx = await loadOrgContext({ id: userId, email: "x@test.nl", name: "Test", avatarColor: "#000", isPlatformAdmin: false, sessionId: "t" }, slug);
  if (!ctx) throw new Error("geen lidmaatschap");
  return ctx;
}

async function chat(ctx: Awaited<ReturnType<typeof orgCtx>>, text: string, conversationId?: string) {
  const convId = conversationId ?? (await withTenant(ctx.tenant, async (tx) => {
    const [c] = await tx<{ id: string }[]>`insert into conversations (org_id, user_id, kind, title, provider, model_id)
      values (app_org_id(), app_user_id(), 'chat', 'Nieuw gesprek', 'demo', 'demo-simulator') returning id`;
    return c.id;
  }));
  const events: ChatEvent[] = [];
  const command = parseSlashCommand(text);
  if (!command) throw new Error("geen opdracht");
  await runChatCommand({ ctx, conversationId: convId, raw: text, command, emit: (e) => { events.push(e); } });
  const msg = events.find((e) => e.type === "assistant_message") as { message: DbMessage } | undefined;
  return { convId, events, message: msg?.message, artifact: msg?.message.metadata.artifact as ChatArtifact | undefined };
}

async function waitTask(ctx: TenantContext, taskId: string) {
  for (let i = 0; i < 20; i++) {
    await drainJobs();
    const [t] = await withTenant(ctx, (tx) => tx<{ status: string }[]>`select status from code_tasks where id = ${taskId}`);
    if (!["queued", "planning", "running"].includes(t.status)) return t.status;
  }
  return "timeout";
}

describe("schrijfstijlen en documenten", () => {
  it("nieuwe workspace krijgt de standaard huisstijl; die komt in de systeeminstructie", async () => {
    const { ctx } = await setup();
    const styles = await withTenant(ctx, (tx) => listStyles(tx));
    const def = styles.find((s) => s.is_default);
    expect(def?.name).toMatch(/natuurlijk/i);
    expect(def?.instructions).toMatch(/kort, vriendelijk en professioneel/);
    const { system } = await withTenant(ctx, (tx) => writingContext(tx, null));
    expect(system).toContain(def!.instructions);
  });

  it("documenten zijn privé tenzij gedeeld; versies en goedkeuring werken", async () => {
    const { org, ctx, owner } = await setup();
    const colleague = await createUser("Collega");
    await addMember(org.id, colleague.id, "member");
    const other: TenantContext = { orgId: org.id, userId: colleague.id };

    const id = await saveDocument(ctx, { title: "Offerte", kind: "email", content: "Versie 1", metadata: {}, shared: false });
    expect(await withTenant(other, (tx) => tx`select id from writing_documents where id = ${id}`)).toHaveLength(0);

    const v2 = await updateDocument(ctx, id, { content: "Versie 2", versionNote: "Aangepast" });
    expect(v2).toMatchObject({ version: 2, changed: true });
    await updateDocument(ctx, id, { status: "approved" });
    const [approved] = await withTenant(ctx, (tx) => tx<{ status: string; approved_by: string }[]>`select status, approved_by from writing_documents where id = ${id}`);
    expect(approved).toEqual({ status: "approved", approved_by: owner.id });

    // Inhoud wijzigen na goedkeuring zet het document terug naar concept.
    await updateDocument(ctx, id, { content: "Versie 3" });
    const [draft] = await withTenant(ctx, (tx) => tx<{ status: string; version: number }[]>`select status, version from writing_documents where id = ${id}`);
    expect(draft).toEqual({ status: "draft", version: 3 });
    const versions = await withTenant(ctx, (tx) => tx`select version from writing_document_versions where document_id = ${id} order by version`);
    expect(versions.map((v) => v.version)).toEqual([1, 2, 3]);

    // Gedeeld: collega ziet het, maar mag (zonder styles.manage) niet wijzigen.
    await updateDocument(ctx, id, { shared: true });
    expect(await withTenant(other, (tx) => tx`select id from writing_documents where id = ${id}`)).toHaveLength(1);
    await expect(updateDocument(other, id, { content: "kaping" })).rejects.toBeInstanceOf(ApiError);
    expect(await withTenant(other, (tx) => tx`delete from writing_documents where id = ${id} returning id`)).toHaveLength(0);
  });

  it("documenten en projecten lekken niet naar een andere organisatie", async () => {
    const a = await setup();
    const b = await setup();
    const id = await saveDocument(a.ctx, { title: "Geheim", kind: "document", content: "x", metadata: {}, shared: true });
    expect(await withTenant(b.ctx, (tx) => tx`select id from writing_documents where id = ${id}`)).toHaveLength(0);
    const pid = await createProject(a.ctx, { name: "Alleen A", description: "", source: { type: "template", template: "empty" } });
    await expect(withTenant(b.ctx, (tx) => getProject(tx, pid))).rejects.toMatchObject({ status: 404 });
    await expect(openProject(b.ctx, pid)).rejects.toMatchObject({ status: 404 });
  });
});

describe("AI Chat-opdrachten", () => {
  it("/email maakt een e-mail met onderwerp; /translate gebruikt het vorige antwoord", async () => {
    const { org, user } = await setup();
    const ctx = await orgCtx(user.id, org.slug);
    const r = await chat(ctx, "/email aan een nieuwe klant over de intake");
    expect(r.artifact?.type).toBe("email");
    expect((r.artifact as { subject: string }).subject.length).toBeGreaterThan(3);
    expect(r.message?.metadata.styleName).toMatch(/natuurlijk/i);
    const t = await chat(ctx, "/translate engels", r.convId);
    expect(t.artifact).toMatchObject({ type: "text", kind: "translation" });
    expect(t.message?.metadata.fromPrevious).toBe(true);
    const [conv] = await withTenant(ctx.tenant, (tx) => tx<{ title: string }[]>`select title from conversations where id = ${r.convId}`);
    expect(conv.title).toMatch(/^E-mail schrijven: aan een nieuwe klant/);
  });

  it("/create slaat een document op; /browser en /code zonder project geven een eerlijke melding", async () => {
    const { org, user } = await setup();
    const ctx = await orgCtx(user.id, org.slug);
    const c = await chat(ctx, "/create werkinstructie sanitair reinigen");
    expect(c.artifact?.type).toBe("document");
    const docId = (c.artifact as { documentId: string }).documentId;
    expect(await withTenant(ctx.tenant, (tx) => tx`select id from writing_documents where id = ${docId}`)).toHaveLength(1);

    const b = await chat(ctx, "/browser open een website", c.convId);
    expect(b.artifact).toMatchObject({ type: "notice" });
    expect((b.artifact as { missing: string[] }).missing.join(" ")).toMatch(/Playwright/);

    const k = await chat(ctx, "/code voeg een test toe", c.convId);
    expect(k.artifact).toMatchObject({ type: "notice", title: "Geen project gekoppeld" });
  });

  it("/code is niet beschikbaar voor leden zonder code-rechten", async () => {
    const { org, user } = await setup("member");
    const ctx = await orgCtx(user.id, org.slug);
    const k = await chat(ctx, "/code maak iets");
    expect(k.artifact).toMatchObject({ type: "notice", title: "Geen toegang tot AI Code" });
  });
});

describe("AI Code", () => {
  it("maakt een project van een sjabloon met Git en verwijdert het weer", async () => {
    const { ctx } = await setup();
    const id = await createProject(ctx, { name: "Sjabloon", description: "", source: { type: "template", template: "node-starter" } });
    const dir = projectDir(ctx.orgId, id);
    const tree = await listTree(dir);
    expect(tree.map((e) => e.path)).toEqual(expect.arrayContaining(["src/offerte.js", "test/offerte.test.js", "package.json"]));
    expect(tree.some((e) => e.path.startsWith(".git"))).toBe(false);
    expect(existsSync(`${dir}/.git`)).toBe(true);
    await deleteProject(ctx, id);
    expect(existsSync(dir)).toBe(false);
  });

  it("weigert klonen van niet-toegestane hosts en onveilige URL's", async () => {
    const { ctx } = await setup();
    await expect(createProject(ctx, { name: "Kwaad", description: "", source: { type: "git", url: "https://kwaadaardig.example/repo.git" } })).rejects.toMatchObject({ status: 400 });
    await expect(createProject(ctx, { name: "Kwaad2", description: "", source: { type: "git", url: "https://user:token@github.com/a/b.git" } })).rejects.toMatchObject({ status: 400 });
  });

  it.skipIf(!sandbox.available)("draait npm test in de sandbox zonder netwerk en vraagt toestemming voor installaties", async () => {
    const { ctx } = await setup();
    const id = await createProject(ctx, { name: "Tests", description: "", source: { type: "template", template: "node-starter" } });
    const r = await runProjectCommand(ctx, id, "npm test", { network: false });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/# pass 3/);
    const net = await runProjectCommand(ctx, id, "wget -q -T 3 -O- http://example.com || echo GEEN_NETWERK", { network: false });
    expect(net.stdout).toContain("GEEN_NETWERK");
    await expect(runProjectCommand(ctx, id, "npm install lodash", { network: false })).rejects.toMatchObject({ status: 409, details: { needsNetwork: true } });
    await expect(runProjectCommand(ctx, id, "docker ps", { network: false })).rejects.toMatchObject({ status: 400 });
    const [logged] = await withTenant(ctx, (tx) => tx<{ n: number }[]>`select count(*)::int as n from code_commands where project_id = ${id}`);
    expect(logged.n).toBe(2);
  }, 60_000);

  it.skipIf(!sandbox.available)("voert een AI Code-taak uit: plan, bestanden, test in sandbox, diff", async () => {
    const { ctx } = await setup();
    const id = await createProject(ctx, { name: "Taak", description: "", source: { type: "template", template: "node-starter" } });
    const prompt = [
      "Voeg een kortingsfunctie toe met test.",
      '/tool read_file {"path":"src/offerte.js"}',
      `/tool write_file ${JSON.stringify({ path: "src/korting.js", content: "export const metKorting = (b, p) => Math.round(b * (1 - p / 100) * 100) / 100;\n" })}`,
      `/tool write_file ${JSON.stringify({ path: "test/korting.test.js", content: "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { metKorting } from '../src/korting.js';\ntest('korting', () => assert.equal(metKorting(200, 10), 180));\n" })}`,
      '/tool run_command {"command":"npm test"}',
      "/tool git_diff {}",
    ].join("\n");
    const taskId = await startCodeTask(ctx, { projectId: id, prompt, provider: "demo", modelId: "demo-simulator" });
    expect(await waitTask(ctx, taskId)).toBe("succeeded");
    const [task] = await withTenant(ctx, (tx) => tx<{ changed_files: string[]; diff: string; plan: unknown; summary: string }[]>`select changed_files, diff, plan, summary from code_tasks where id = ${taskId}`);
    expect(task.changed_files.sort()).toEqual(["src/korting.js", "test/korting.test.js"]);
    expect(task.diff).toContain("+export const metKorting");
    expect(task.plan).toBeTruthy();
    const steps = await withTenant(ctx, (tx) => tx<{ kind: string; status: string; data: { exitCode?: number } | null }[]>`select kind, status, data from code_task_steps where task_id = ${taskId} order by id`);
    expect(steps[0].kind).toBe("plan");
    const cmd = steps.find((s) => s.kind === "command");
    expect(cmd?.data?.exitCode).toBe(0);
    expect(steps.at(-1)?.kind).toBe("final");
  }, 90_000);

  it.skipIf(!sandbox.available)("pauzeert bij installatie tot de gebruiker beslist; weigeren gaat zonder installatie verder", async () => {
    const { ctx, org, user } = await setup();
    const oc = await orgCtx(user.id, org.slug);
    const id = await createProject(ctx, { name: "Install", description: "", source: { type: "template", template: "node-starter" } });
    const taskId = await startCodeTask(ctx, { projectId: id, prompt: 'Installeer.\n/tool run_command {"command":"npm install left-pad"}\n/tool git_status {}', provider: "demo", modelId: "demo-simulator" });
    expect(await waitTask(ctx, taskId)).toBe("waiting_approval");
    const [a] = await withTenant(ctx, (tx) => tx<{ id: string; kind: string; summary: string }[]>`select id, kind, summary from approval_requests where code_task_id = ${taskId}`);
    expect(a).toMatchObject({ kind: "code_command", summary: "npm install left-pad" });
    await decideApproval(ctx, oc.role, a.id, false);
    expect(await waitTask(ctx, taskId)).toBe("succeeded");
    const [cmds] = await withTenant(ctx, (tx) => tx<{ n: number }[]>`select count(*)::int as n from code_commands where task_id = ${taskId}`);
    expect(cmds.n).toBe(0);
    const steps = await withTenant(ctx, (tx) => tx<{ title: string; status: string }[]>`select title, status from code_task_steps where task_id = ${taskId} and kind = 'approval' order by id`);
    expect(steps.map((s) => s.status)).toEqual(["ok", "error"]);
  }, 90_000);
});
