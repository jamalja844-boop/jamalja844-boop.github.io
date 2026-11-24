import { withTenant, type TenantContext } from "@/lib/db";
import { env } from "@/lib/env";
import { ApiError, ConfigurationError } from "@/lib/api/errors";
import { decryptSecret, encryptSecret } from "@/lib/security/crypto";
import { audit } from "@/lib/security/audit";

/**
 * Persoonlijke GitHub-koppeling (OAuth). Het token is per gebruiker per workspace opgeslagen,
 * AES-256-GCM-versleuteld en gebonden aan organisatie + gebruiker. Het gaat nooit naar de
 * browser of de sandbox; git gebruikt het via omgevingsvariabelen.
 */
const API = "https://api.github.com";
const UA = "AI-WorkStudio-Pro";

let fetchImpl: typeof fetch = (...a) => fetch(...a);
/** Alleen voor tests: GitHub-verkeer nabootsen. */
export function __setGithubFetchForTests(f: typeof fetch | null) {
  fetchImpl = f ?? ((...a) => fetch(...a));
}

const aad = (ctx: TenantContext) => `${ctx.orgId}:${ctx.userId}:github`;

export function githubConfigured() {
  const e = env();
  return Boolean(e.GITHUB_CLIENT_ID && e.GITHUB_CLIENT_SECRET);
}

function requireConfig() {
  const e = env();
  if (!e.GITHUB_CLIENT_ID || !e.GITHUB_CLIENT_SECRET) {
    throw new ConfigurationError("GitHub is nog niet ingesteld op de server: zet GITHUB_CLIENT_ID en GITHUB_CLIENT_SECRET in .env (GitHub → Settings → Developer settings → OAuth Apps).", { provider: "github", where: ".env" });
  }
  return { clientId: e.GITHUB_CLIENT_ID, clientSecret: e.GITHUB_CLIENT_SECRET, scopes: e.GITHUB_OAUTH_SCOPES, appUrl: e.APP_URL };
}

export const githubRedirectUri = () => `${env().APP_URL}/api/integrations/github/callback`;

export function authorizeUrl(state: string) {
  const c = requireConfig();
  const p = new URLSearchParams({ client_id: c.clientId, redirect_uri: githubRedirectUri(), scope: c.scopes, state, allow_signup: "false" });
  return `https://github.com/login/oauth/authorize?${p}`;
}

async function gh<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetchImpl(`${API}${path}`, {
    ...init,
    headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": UA, Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text.slice(0, 200) };
  }
  if (!res.ok) {
    const msg = (data as { message?: string; errors?: { message?: string }[] })?.errors?.[0]?.message ?? (data as { message?: string })?.message ?? `GitHub-fout ${res.status}`;
    if (res.status === 401) throw new ApiError(401, "De GitHub-koppeling is verlopen of ingetrokken. Koppel GitHub opnieuw.", { reconnect: true });
    if (res.status === 403 || res.status === 404) throw new ApiError(res.status, `GitHub weigert de actie: ${msg}. Controleer of je toegang hebt tot deze repository.`);
    throw new ApiError(res.status >= 500 ? 502 : 400, `GitHub: ${msg}`);
  }
  return data as T;
}

/** Ruilt de OAuth-code in, haalt het account op en slaat het token versleuteld op. */
export async function completeGithubOAuth(ctx: TenantContext, code: string) {
  const c = requireConfig();
  const res = await fetchImpl("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({ client_id: c.clientId, client_secret: c.clientSecret, code, redirect_uri: githubRedirectUri() }),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; scope?: string; error_description?: string; error?: string };
  if (!res.ok || !data.access_token) throw new ApiError(400, data.error_description ?? data.error ?? "GitHub gaf geen token terug");
  const user = await gh<{ login: string; id: number }>(data.access_token, "/user");
  await withTenant(ctx, async (tx) => {
    await tx`
      insert into user_connections (org_id, user_id, provider, encrypted_token, account_login, account_id, scopes)
      values (app_org_id(), app_user_id(), 'github', ${encryptSecret(data.access_token!, aad(ctx))}, ${user.login}, ${String(user.id)}, ${data.scope ?? ""})
      on conflict (org_id, user_id, provider) do update set encrypted_token = excluded.encrypted_token, account_login = excluded.account_login,
        account_id = excluded.account_id, scopes = excluded.scopes`;
    await audit(tx, { action: "github.connected", targetType: "user_connection", targetId: "github", metadata: { login: user.login, scopes: data.scope ?? "" } });
  });
  return { login: user.login };
}

export async function githubStatus(ctx: TenantContext) {
  const [row] = await withTenant(ctx, (tx) => tx<{ account_login: string; scopes: string; updated_at: Date }[]>`
    select account_login, scopes, updated_at from user_connections where provider = 'github'`);
  return { configured: githubConfigured(), connected: row ? { login: row.account_login, scopes: row.scopes, connectedAt: row.updated_at } : null };
}

export async function githubToken(ctx: TenantContext): Promise<string> {
  const [row] = await withTenant(ctx, (tx) => tx<{ encrypted_token: string }[]>`select encrypted_token from user_connections where provider = 'github'`);
  if (!row) throw new ConfigurationError("Koppel eerst je GitHub-account (AI Code → GitHub koppelen).", { provider: "github", where: "code" });
  return decryptSecret(row.encrypted_token, aad(ctx));
}

/** Ontkoppelt: verwijdert het token lokaal en trekt de toestemming bij GitHub in (best effort). */
export async function disconnectGithub(ctx: TenantContext) {
  let token: string | null = null;
  try {
    token = await githubToken(ctx);
  } catch {
    token = null;
  }
  await withTenant(ctx, async (tx) => {
    await tx`delete from user_connections where provider = 'github'`;
    await audit(tx, { action: "github.disconnected", targetType: "user_connection", targetId: "github" });
  });
  if (token && githubConfigured()) {
    const c = requireConfig();
    await fetchImpl(`${API}/applications/${c.clientId}/grant`, {
      method: "DELETE",
      headers: { Accept: "application/vnd.github+json", "User-Agent": UA, Authorization: `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: token }),
    }).catch(() => undefined);
  }
}

export interface RepoInfo {
  full_name: string;
  private: boolean;
  default_branch: string;
  description: string | null;
  updated_at: string;
  permissions?: { push?: boolean };
}

export async function listRepos(ctx: TenantContext): Promise<RepoInfo[]> {
  const token = await githubToken(ctx);
  const repos = await gh<RepoInfo[]>(token, "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member");
  return repos.map((r) => ({ full_name: r.full_name, private: r.private, default_branch: r.default_branch, description: r.description, updated_at: r.updated_at, permissions: { push: Boolean(r.permissions?.push) } }));
}

export const REPO_RE = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;

export async function getRepo(ctx: TenantContext, fullName: string): Promise<RepoInfo> {
  if (!REPO_RE.test(fullName)) throw new ApiError(400, "Ongeldige repositorynaam (verwacht eigenaar/naam)");
  return gh<RepoInfo>(await githubToken(ctx), `/repos/${fullName}`);
}

export async function createPullRequest(ctx: TenantContext, fullName: string, pr: { title: string; body: string; head: string; base: string; draft: boolean }) {
  if (!REPO_RE.test(fullName)) throw new ApiError(400, "Ongeldige repositorynaam");
  return gh<{ html_url: string; number: number }>(await githubToken(ctx), `/repos/${fullName}/pulls`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pr),
  });
}

/** "eigenaar/naam" uit een github.com-URL, anders null. */
export function parseGithubRepo(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}
