import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { gitOps } from "@workstudio/code-execution";
import { closeDb, withSystem, withTenant } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import {
  __setGithubFetchForTests, authorizeUrl, completeGithubOAuth, createPullRequest, disconnectGithub, githubStatus, githubToken, listRepos, parseGithubRepo,
} from "@/lib/github/service";
import { createProject, openProject, pushToGithub } from "@/lib/code/projects";
import { taskBranchName } from "@/lib/code/runner";
import { addMember, createUser, setup } from "./helpers";

const TOKEN = "gho_testtoken1234567890abcdef";

beforeAll(() => {
  process.env.GITHUB_CLIENT_ID = "Iv1.testclient";
  process.env.GITHUB_CLIENT_SECRET = "test-secret-niet-echt";
  resetEnvCache();
});
afterEach(() => __setGithubFetchForTests(null));
afterAll(async () => {
  delete process.env.GITHUB_CLIENT_ID;
  delete process.env.GITHUB_CLIENT_SECRET;
  resetEnvCache();
  await closeDb();
});

type Call = { url: string; init?: RequestInit };
function mockGithub(routes: Record<string, (c: Call) => { status?: number; body: unknown }>) {
  const calls: Call[] = [];
  __setGithubFetchForTests((async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
    const r = routes[key]({ url, init });
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch);
  return calls;
}

describe("GitHub-koppeling", () => {
  it("maakt een correcte autorisatie-URL", () => {
    const u = new URL(authorizeUrl("abc123"));
    expect(u.origin + u.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(u.searchParams.get("client_id")).toBe("Iv1.testclient");
    expect(u.searchParams.get("state")).toBe("abc123");
    expect(u.searchParams.get("redirect_uri")).toBe("http://localhost:3100/api/integrations/github/callback");
    expect(u.searchParams.get("scope")).toBe("repo read:user");
  });

  it("slaat het token versleuteld en persoonlijk op; ontkoppelen trekt de toestemming in", async () => {
    const { org, ctx } = await setup("developer");
    const calls = mockGithub({
      "login/oauth/access_token": () => ({ body: { access_token: TOKEN, scope: "repo,read:user", token_type: "bearer" } }),
      "api.github.com/user": () => ({ body: { login: "clean-dev", id: 42 } }),
      "/grant": () => ({ status: 204, body: null }),
    });
    expect(await completeGithubOAuth(ctx, "code-1")).toEqual({ login: "clean-dev" });
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({ client_id: "Iv1.testclient", code: "code-1" });
    expect((calls[1].init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);

    const [row] = await withSystem((tx) => tx<{ encrypted_token: string }[]>`select encrypted_token from user_connections where org_id = ${org.id}`);
    expect(row.encrypted_token).not.toContain(TOKEN);
    expect(await githubToken(ctx)).toBe(TOKEN);
    expect((await githubStatus(ctx)).connected?.login).toBe("clean-dev");

    // Een collega (ook beheerder) ziet of gebruikt dit token niet.
    const admin = await createUser("Beheerder");
    await addMember(org.id, admin.id, "admin");
    const adminCtx = { orgId: org.id, userId: admin.id };
    expect((await githubStatus(adminCtx)).connected).toBeNull();
    await expect(githubToken(adminCtx)).rejects.toMatchObject({ status: 424 });

    await disconnectGithub(ctx);
    expect((await githubStatus(ctx)).connected).toBeNull();
    const revoke = calls.find((c) => c.url.includes("/applications/Iv1.testclient/grant"));
    expect(revoke?.init?.method).toBe("DELETE");
    expect((revoke?.init?.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
  });

  it("weigert een mislukte code-uitwisseling en meldt een ingetrokken token duidelijk", async () => {
    const { ctx } = await setup();
    mockGithub({ "login/oauth/access_token": () => ({ body: { error: "bad_verification_code", error_description: "The code passed is incorrect or expired." } }) });
    await expect(completeGithubOAuth(ctx, "oud")).rejects.toMatchObject({ status: 400 });
    mockGithub({
      "login/oauth/access_token": () => ({ body: { access_token: TOKEN, scope: "repo" } }),
      "api.github.com/user": () => ({ body: { login: "x", id: 1 } }),
    });
    await completeGithubOAuth(ctx, "ok");
    mockGithub({ "/user/repos": () => ({ status: 401, body: { message: "Bad credentials" } }) });
    await expect(listRepos(ctx)).rejects.toMatchObject({ status: 401, details: { reconnect: true } });
  });

  it("toont repository's en maakt een pull request met de juiste gegevens", async () => {
    const { ctx } = await setup();
    mockGithub({
      "login/oauth/access_token": () => ({ body: { access_token: TOKEN, scope: "repo" } }),
      "api.github.com/user": () => ({ body: { login: "clean-dev", id: 7 } }),
    });
    await completeGithubOAuth(ctx, "c");
    const calls = mockGithub({
      "/user/repos": () => ({ body: [{ full_name: "clean/website", private: true, default_branch: "main", description: null, updated_at: "2026-11-01T00:00:00Z", permissions: { push: true } }] }),
      "/repos/clean/website/pulls": (c) => ({ status: 201, body: { html_url: "https://github.com/clean/website/pull/5", number: 5, echo: JSON.parse(String(c.init?.body)) } }),
    });
    const repos = await listRepos(ctx);
    expect(repos).toEqual([expect.objectContaining({ full_name: "clean/website", private: true, permissions: { push: true } })]);
    const pr = await createPullRequest(ctx, "clean/website", { title: "Korting toevoegen", body: "AI Code", head: "ai/korting-1a2b", base: "main", draft: true });
    expect(pr.number).toBe(5);
    expect(JSON.parse(String(calls.at(-1)!.init?.body))).toEqual({ title: "Korting toevoegen", body: "AI Code", head: "ai/korting-1a2b", base: "main", draft: true });
    await expect(createPullRequest(ctx, "../../evil", { title: "x", body: "", head: "a", base: "main", draft: true })).rejects.toMatchObject({ status: 400 });
  });
});

describe("pushen naar GitHub", () => {
  it("weigert zonder bevestiging, zonder koppeling, met niet-gecommitte wijzigingen en op de hoofdbranch", async () => {
    const { ctx } = await setup();
    const id = await createProject(ctx, { name: "Site", description: "", source: { type: "template", template: "node-starter" } });
    await expect(pushToGithub(ctx, id, { confirm: false })).rejects.toMatchObject({ status: 400 });
    await expect(pushToGithub(ctx, id, { confirm: true })).rejects.toMatchObject({ status: 409 }); // geen github_repo
    const { dir } = await openProject(ctx, id);
    await withTenant(ctx, (tx) => tx`update code_projects set github_repo = 'clean/site', default_branch = 'main' where id = ${id}`);
    execFileSync("git", ["-c", "safe.directory=*", "-C", dir, "remote", "add", "origin", "https://github.com/clean/site.git"]);
    const { writeText } = await import("@workstudio/code-execution");
    await writeText(dir, "nieuw.txt", "wijziging");
    await expect(pushToGithub(ctx, id, { confirm: true })).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/niet-gecommitte/) });
    await gitOps.commitAll(dir, "Wijziging");
    await expect(pushToGithub(ctx, id, { confirm: true })).rejects.toMatchObject({ status: 409, details: { defaultBranch: true } });
    await gitOps.createBranch(dir, "ai/test-1234");
    await expect(pushToGithub(ctx, id, { confirm: true })).rejects.toMatchObject({ status: 424 }); // GitHub niet gekoppeld
  });

  it("pusht met het token via omgevingsvariabelen; het token komt nooit in .git/config", async () => {
    const work = mkdtempSync(`${tmpdir()}/gh-push-`);
    const bare = `${work}/remote.git`;
    const dir = `${work}/project`;
    execFileSync("git", ["init", "-q", "--bare", bare]);
    execFileSync("mkdir", ["-p", dir]);
    await gitOps.initRepo(dir, "Start");
    execFileSync("git", ["-C", dir, "remote", "add", "origin", bare]);
    await gitOps.createBranch(dir, "ai/korting-ab12");
    const out = await gitOps.pushBranch(dir, "ai/korting-ab12", { auth: gitOps.authEnv(TOKEN), testAllowFile: true });
    expect(out).toContain("refs/heads/ai/korting-ab12");
    expect(execFileSync("git", ["-C", bare, "branch", "--list"]).toString()).toContain("ai/korting-ab12");
    expect(readFileSync(`${dir}/.git/config`, "utf8")).not.toContain(TOKEN);
    await expect(gitOps.pushBranch(dir, "--force", { testAllowFile: true })).rejects.toThrow(/Ongeldige branchnaam/);
  });
});

describe("hulpfuncties", () => {
  it("authEnv beperkt de header tot github.com en zet het token niet in argumenten", () => {
    const env = gitOps.authEnv(TOKEN);
    expect(env.GIT_CONFIG_KEY_0).toBe("http.https://github.com/.extraheader");
    expect(Buffer.from(env.GIT_CONFIG_VALUE_0.replace("AUTHORIZATION: basic ", ""), "base64").toString()).toBe(`x-access-token:${TOKEN}`);
    expect(() => gitOps.authEnv(TOKEN, "evil.com/x")).toThrow();
  });
  it("herkent GitHub-URL's en maakt nette branchnamen", () => {
    expect(parseGithubRepo("https://github.com/clean/website.git")).toBe("clean/website");
    expect(parseGithubRepo("https://github.com/clean/website")).toBe("clean/website");
    expect(parseGithubRepo("https://gitlab.com/clean/website")).toBeNull();
    expect(parseGithubRepo("https://github.com/clean/website/tree/main")).toBeNull();
    expect(taskBranchName("Voeg een korting van 10% toe aan de offerte")).toMatch(/^ai\/voeg-een-korting-van-[0-9a-f]{4}$/);
  });
});
