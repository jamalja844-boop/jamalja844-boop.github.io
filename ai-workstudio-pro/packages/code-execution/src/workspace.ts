import { promises as fs } from "node:fs";
import path from "node:path";

export class WorkspaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceError";
  }
}

const IGNORED_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage", ".turbo", ".cache", "__pycache__", ".venv", "vendor"]);
const MAX_READ = 1_000_000;
const MAX_WRITE = 2_000_000;

/** Lost een relatief pad op binnen de projectmap; weigert alles daarbuiten en in .git. */
export function resolveInside(root: string, rel: string): string {
  if (typeof rel !== "string" || rel.includes("\0")) throw new WorkspaceError("Ongeldig pad");
  const clean = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  const target = path.resolve(root, clean);
  const relative = path.relative(root, target);
  if (relative === "" ) return target;
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new WorkspaceError("Pad ligt buiten het project");
  if (relative.split(path.sep).includes(".git")) throw new WorkspaceError("De .git-map kan niet rechtstreeks worden bewerkt");
  return target;
}

/** Controleert dat symbolische links niet naar buiten het project wijzen. */
async function assertRealInside(root: string, target: string) {
  const realRoot = await fs.realpath(root);
  let probe = target;
  for (;;) {
    try {
      const real = await fs.realpath(probe);
      const rel = path.relative(realRoot, real);
      if (rel.startsWith("..") || path.isAbsolute(rel)) throw new WorkspaceError("Pad wijst via een link naar buiten het project");
      return;
    } catch (e) {
      if (e instanceof WorkspaceError) throw e;
      const parent = path.dirname(probe);
      if (parent === probe) return;
      probe = parent;
    }
  }
}

export interface TreeEntry {
  path: string;
  type: "file" | "dir";
  size: number;
}

export async function listTree(root: string, sub = "", maxEntries = 3000): Promise<TreeEntry[]> {
  const out: TreeEntry[] = [];
  const start = resolveInside(root, sub);
  await assertRealInside(root, start);
  async function walk(dir: string) {
    if (out.length >= maxEntries) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1));
    for (const e of entries) {
      if (out.length >= maxEntries) return;
      const full = path.join(dir, e.name);
      const rel = path.relative(root, full).split(path.sep).join("/");
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory() && e.name === ".git") continue;
      if (e.isDirectory()) {
        out.push({ path: rel, type: "dir", size: 0 });
        if (!IGNORED_DIRS.has(e.name)) await walk(full);
      } else if (e.isFile()) {
        const st = await fs.stat(full);
        out.push({ path: rel, type: "file", size: st.size });
      }
    }
  }
  await walk(start);
  return out;
}

function isBinary(buf: Buffer) {
  return buf.subarray(0, 8000).includes(0);
}

export async function readText(root: string, rel: string, opts: { startLine?: number; endLine?: number } = {}) {
  const target = resolveInside(root, rel);
  await assertRealInside(root, target);
  const st = await fs.stat(target).catch(() => null);
  if (!st || !st.isFile()) throw new WorkspaceError(`Bestand niet gevonden: ${rel}`);
  if (st.size > MAX_READ) throw new WorkspaceError(`Bestand is te groot om te lezen (${Math.round(st.size / 1024)} KB)`);
  const buf = await fs.readFile(target);
  if (isBinary(buf)) throw new WorkspaceError("Binair bestand; kan niet als tekst worden gelezen");
  const text = buf.toString("utf8");
  if (opts.startLine || opts.endLine) {
    const lines = text.split("\n");
    const s = Math.max(1, opts.startLine ?? 1);
    const e = Math.min(lines.length, opts.endLine ?? lines.length);
    return { content: lines.slice(s - 1, e).join("\n"), totalLines: lines.length };
  }
  return { content: text, totalLines: text.split("\n").length };
}

export async function writeText(root: string, rel: string, content: string) {
  if (Buffer.byteLength(content) > MAX_WRITE) throw new WorkspaceError("Inhoud is te groot (max. 2 MB)");
  const target = resolveInside(root, rel);
  // Controle vóór het aanmaken van mappen: een link in het pad mag nooit naar buiten wijzen.
  await assertRealInside(root, target);
  const lst = await fs.lstat(target).catch(() => null);
  if (lst?.isSymbolicLink()) throw new WorkspaceError("Een symbolische link kan niet worden overschreven");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await assertRealInside(root, target);
  const existed = Boolean(lst);
  await fs.writeFile(target, content, "utf8");
  return { created: !existed, bytes: Buffer.byteLength(content) };
}

/** Vervangt precies één voorkomen van oldText; anders een duidelijke fout. */
export async function editText(root: string, rel: string, oldText: string, newText: string) {
  if (!oldText) throw new WorkspaceError("oldText mag niet leeg zijn");
  const { content } = await readText(root, rel);
  const count = content.split(oldText).length - 1;
  if (count === 0) throw new WorkspaceError(`De te vervangen tekst komt niet voor in ${rel}`);
  if (count > 1) throw new WorkspaceError(`De te vervangen tekst komt ${count} keer voor in ${rel}; maak hem unieker`);
  await writeText(root, rel, content.replace(oldText, () => newText));
  return { replaced: 1 };
}

export async function deletePath(root: string, rel: string) {
  const target = resolveInside(root, rel);
  if (target === path.resolve(root)) throw new WorkspaceError("De projectmap zelf kan niet worden verwijderd");
  await assertRealInside(root, target);
  await fs.rm(target, { recursive: true, force: false });
}

export async function searchText(root: string, query: string, maxResults = 100) {
  const q = query.toLowerCase();
  if (!q.trim()) throw new WorkspaceError("Lege zoekterm");
  const results: { path: string; line: number; text: string }[] = [];
  for (const entry of await listTree(root)) {
    if (entry.type !== "file" || entry.size > MAX_READ) continue;
    const buf = await fs.readFile(path.join(root, entry.path)).catch(() => null);
    if (!buf || isBinary(buf)) continue;
    const lines = buf.toString("utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(q)) {
        results.push({ path: entry.path, line: i + 1, text: lines[i].slice(0, 300) });
        if (results.length >= maxResults) return results;
      }
    }
  }
  return results;
}

export async function copyTemplate(templateDir: string, dest: string) {
  await fs.mkdir(dest, { recursive: true });
  await fs.cp(templateDir, dest, { recursive: true, errorOnExist: false, force: true });
}
