import { execFile } from "node:child_process";

export class GitError extends Error {}

// Hooks, fsmonitor en lokale/onveilige protocollen uitgeschakeld: Git voert nooit code uit het project uit.
const SAFE = [
  "-c", "core.hooksPath=/dev/null",
  "-c", "core.fsmonitor=false",
  "-c", "safe.directory=*",
  "-c", "protocol.allow=never",
  "-c", "protocol.https.allow=always",
  "-c", "init.defaultBranch=main",
  "-c", "user.name=AI WorkStudio",
  "-c", "user.email=ai@workstudio.local",
];

/**
 * Inloggegevens voor git via omgevingsvariabelen (GIT_CONFIG_COUNT): het token staat dan niet in de
 * opdrachtregel, niet in de URL en niet in .git/config, en geldt alleen voor de opgegeven host.
 */
export function authEnv(token: string, host = "github.com"): Record<string, string> {
  if (!/^[\w.-]+$/.test(host)) throw new GitError("Ongeldige host");
  const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
  return { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: `http.https://${host}/.extraheader`, GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}` };
}

export function git(dir: string, args: string[], timeoutMs = 30_000, extraEnv: Record<string, string> = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      "git",
      [...SAFE, ...args],
      { cwd: dir, timeout: timeoutMs, maxBuffer: 20_000_000, env: { PATH: process.env.PATH ?? "/usr/bin:/bin", GIT_TERMINAL_PROMPT: "0", HOME: process.env.HOME ?? "/tmp", LANG: "C.UTF-8", ...extraEnv } as unknown as NodeJS.ProcessEnv },
      (err, stdout, stderr) => resolve({ code: err ? 1 : 0, stdout: String(stdout), stderr: String(stderr) }),
    );
  });
}

async function must(dir: string, args: string[], timeoutMs?: number) {
  const r = await git(dir, args, timeoutMs);
  if (r.code !== 0) throw new GitError(r.stderr.trim() || `git ${args[0]} mislukt`);
  return r.stdout;
}

export async function initRepo(dir: string, message = "Initiële versie") {
  await must(dir, ["init", "-q"]);
  await must(dir, ["add", "-A"]);
  await git(dir, ["commit", "-q", "--allow-empty", "-m", message]);
}

export interface StatusEntry {
  path: string;
  index: string;
  worktree: string;
  label: "nieuw" | "gewijzigd" | "verwijderd" | "hernoemd" | "conflict";
}

export async function status(dir: string): Promise<{ branch: string; entries: StatusEntry[] }> {
  const out = await must(dir, ["status", "--porcelain=v1", "-b", "--untracked-files=all"]);
  const lines = out.split("\n").filter(Boolean);
  const branch = (lines[0]?.startsWith("## ") ? lines.shift()!.slice(3).split("...")[0] : "onbekend").replace(/^No commits yet on /, "");
  const entries = lines.map((l) => {
    const index = l[0];
    const worktree = l[1];
    const p = l.slice(3);
    const code = `${index}${worktree}`;
    const label: StatusEntry["label"] = code.includes("U") ? "conflict" : code === "??" || code.includes("A") ? "nieuw" : code.includes("D") ? "verwijderd" : code.includes("R") ? "hernoemd" : "gewijzigd";
    return { path: p.includes(" -> ") ? p.split(" -> ")[1] : p, index, worktree, label };
  });
  return { branch, entries };
}

/** Diff van alle wijzigingen sinds de laatste commit, inclusief nieuwe bestanden. */
export async function diff(dir: string, maxBytes = 400_000): Promise<string> {
  await git(dir, ["add", "-A", "--intent-to-add"]);
  const out = await must(dir, ["diff", "--no-color", "--no-ext-diff", "HEAD"]).catch(async () => must(dir, ["diff", "--no-color", "--no-ext-diff"]));
  return out.length > maxBytes ? out.slice(0, maxBytes) + "\n… [diff ingekort]" : out;
}

export async function branches(dir: string) {
  const out = await must(dir, ["branch", "--format=%(refname:short)|%(HEAD)"]);
  return out.split("\n").filter(Boolean).map((l) => {
    const [name, head] = l.split("|");
    return { name, current: head === "*" };
  });
}

const BRANCH_RE = /^(?!.*\.\.)(?!\/)(?!.*\/$)[a-zA-Z0-9._/-]{1,80}$/;

export async function createBranch(dir: string, name: string) {
  if (!BRANCH_RE.test(name) || name.startsWith("-")) throw new GitError("Ongeldige branchnaam");
  await must(dir, ["checkout", "-q", "-b", name]);
}

export async function checkout(dir: string, name: string) {
  if (!BRANCH_RE.test(name) || name.startsWith("-")) throw new GitError("Ongeldige branchnaam");
  await must(dir, ["checkout", "-q", name]);
}

export async function commitAll(dir: string, message: string, author?: { name: string; email: string }) {
  if (!message.trim()) throw new GitError("Commitbericht is leeg");
  await must(dir, ["add", "-A"]);
  const who = author ? ["-c", `user.name=${author.name.replace(/[<>\n]/g, "").slice(0, 100)}`, "-c", `user.email=${author.email.replace(/[<>\s]/g, "").slice(0, 200)}`] : [];
  const r = await git(dir, [...who, "commit", "-q", "-m", message.slice(0, 500)]);
  if (r.code !== 0 && /nothing to commit/.test(r.stdout + r.stderr)) throw new GitError("Er zijn geen wijzigingen om te committen");
  if (r.code !== 0) throw new GitError(r.stderr.trim() || "Commit mislukt");
  return (await must(dir, ["rev-parse", "--short", "HEAD"])).trim();
}

export async function log(dir: string, limit = 20) {
  const r = await git(dir, ["log", `-${limit}`, "--pretty=format:%h|%an|%ar|%s"]);
  if (r.code !== 0) return [];
  return r.stdout.split("\n").filter(Boolean).map((l) => {
    const [hash, author, when, ...msg] = l.split("|");
    return { hash, author, when, message: msg.join("|") };
  });
}

/** Kloont een openbare https-repository van een toegestane host (ondiep, zonder hooks). */
export async function cloneRepo(url: string, dir: string, opts: { branch?: string; allowedHosts: string[]; auth?: Record<string, string> }) {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new GitError("Ongeldige repository-URL");
  }
  if (u.protocol !== "https:") throw new GitError("Alleen https-repository's zijn toegestaan");
  if (u.username || u.password) throw new GitError("Zet geen inloggegevens in de URL; gebruik de GitHub-koppeling");
  if (!opts.allowedHosts.includes(u.hostname.toLowerCase())) throw new GitError(`Host ${u.hostname} staat niet op de lijst met toegestane Git-hosts`);
  if (opts.branch && (!BRANCH_RE.test(opts.branch) || opts.branch.startsWith("-"))) throw new GitError("Ongeldige branchnaam");
  const args = ["clone", "--depth", "1", "--single-branch", "--no-tags", ...(opts.branch ? ["--branch", opts.branch] : []), "--", u.toString(), dir];
  const r = await git(process.cwd(), args, 180_000, opts.auth ?? {});
  if (r.code !== 0) throw new GitError(scrub(r.stderr).trim().split("\n").slice(-2).join(" ") || "Klonen mislukt");
}

/** Verwijdert eventuele tokens uit foutmeldingen van git. */
function scrub(s: string) {
  return s.replace(/(basic|bearer|token)\s+[A-Za-z0-9+/=_-]{8,}/gi, "$1 ***").replace(/gh[pousr]_[A-Za-z0-9]{10,}/g, "***");
}

export async function currentBranch(dir: string) {
  return (await must(dir, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
}

export async function remoteUrl(dir: string, remote = "origin") {
  const r = await git(dir, ["remote", "get-url", remote]);
  return r.code === 0 ? r.stdout.trim() : null;
}

/**
 * Pusht een branch naar de remote. `testAllowFile` is uitsluitend voor tests met een lokale bare repository.
 */
export async function pushBranch(dir: string, branch: string, opts: { auth?: Record<string, string>; remote?: string; testAllowFile?: boolean } = {}) {
  if (!BRANCH_RE.test(branch) || branch.startsWith("-")) throw new GitError("Ongeldige branchnaam");
  const extra = opts.testAllowFile ? ["-c", "protocol.file.allow=always"] : [];
  const r = await git(dir, [...extra, "push", "--porcelain", "--set-upstream", opts.remote ?? "origin", `refs/heads/${branch}:refs/heads/${branch}`], 120_000, opts.auth ?? {});
  if (r.code !== 0) throw new GitError(scrub(r.stderr).trim().split("\n").slice(-3).join(" ") || "Pushen mislukt");
  return scrub(r.stdout).trim();
}
