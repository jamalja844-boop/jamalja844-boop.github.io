"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft, Bot, ChevronDown, ChevronRight, File, FilePlus2, Folder, FolderOpen, GitBranch, GitCommitHorizontal, History, Play,
  CloudUpload, ExternalLink, GitPullRequest, RefreshCw, Save, ServerCog, ShieldAlert, Sparkles, Terminal, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Badge, Spinner } from "@/components/ui/misc";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { DiffView } from "@/components/code/diff-view";
import { CodeTaskPanel, TASK_STATUS } from "@/components/code/task-view";
import type { SandboxInfo } from "@/components/code/projects-overview";
import { api, ClientApiError } from "@/lib/client/api";
import { cn, timeAgo } from "@/lib/utils";

const CodeEditor = dynamic(() => import("@/components/code/code-editor").then((m) => m.CodeEditor), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center"><Spinner /></div>,
});

interface TreeEntry { path: string; type: "file" | "dir"; size?: number }
interface TaskRow { id: string; prompt: string; status: string; created_at: string; changed_files: string[] }
interface CommandRow { id: string; command: string; network: boolean; exit_code: number | null; duration_ms: number | null; timed_out: boolean; created_at: string; stdout: string; stderr: string; task_id: string | null }
interface GitData {
  status: { branch: string; entries: { path: string; label: string }[] };
  diff: string;
  branches: { name: string; current: boolean }[];
  log: { hash: string; author: string; when: string; message: string }[];
}

export interface ProjectInfo {
  id: string;
  name: string;
  description: string;
  source_type: string;
  source_ref: string;
  status: string;
  error: string | null;
  github_repo: string | null;
  default_branch: string | null;
  last_pr_url: string | null;
}

const TEMPLATE_PROMPT = "Voeg aan berekenOfferte een optionele korting in procenten toe (standaard 0, maximaal 50) die op het bedrag excl. btw wordt toegepast. Voeg een test toe en zorg dat alle tests slagen.";

export function ProjectWorkspace({ slug, project, initialTasks, initialCommands, sandbox, models }: {
  slug: string;
  project: ProjectInfo;
  initialTasks: TaskRow[];
  initialCommands: CommandRow[];
  sandbox: SandboxInfo;
  models: { value: string; label: string; available: boolean }[];
}) {
  const search = useSearchParams();
  const router = useRouter();
  const base = `/api/w/${slug}/code/projects/${project.id}`;
  const [tree, setTree] = useState<TreeEntry[] | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [openFile, setOpenFile] = useState<{ path: string; content: string; saved: string } | null>(null);
  const [tasks, setTasks] = useState(initialTasks);
  const [commands, setCommands] = useState(initialCommands);
  const [taskId, setTaskId] = useState<string | null>(search.get("task") ?? initialTasks[0]?.id ?? null);
  const [prompt, setPrompt] = useState(project.source_ref === "node-starter" && initialTasks.length === 0 ? TEMPLATE_PROMPT : "");
  const [model, setModel] = useState(models.find((m) => m.available && !m.value.startsWith("demo::"))?.value ?? models.find((m) => m.available)?.value ?? "");
  const [starting, setStarting] = useState(false);
  const [bottom, setBottom] = useState<"terminal" | "git" | "history">("terminal");
  const [git, setGit] = useState<GitData | null>(null);
  const [cmd, setCmd] = useState("npm test");
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<CommandRow | null>(null);
  const [networkConfirm, setNetworkConfirm] = useState<string | null>(null);
  const [commitMsg, setCommitMsg] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [taskBranch, setTaskBranch] = useState(Boolean(project.github_repo));
  const [ghDialog, setGhDialog] = useState<null | "push" | "pr">(null);
  const [ghForm, setGhForm] = useState({ confirm: false, allowDefault: false, title: "", body: "", draft: true });
  const [ghBusy, setGhBusy] = useState(false);
  const [lastPr, setLastPr] = useState<string | null>(project.last_pr_url);

  const loadTree = useCallback(async () => {
    try {
      setTree((await api.get<{ tree: TreeEntry[] }>(`${base}/files`)).tree);
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Bestanden laden mislukt");
    }
  }, [base]);

  const loadGit = useCallback(async () => {
    try {
      setGit(await api.get<GitData>(`${base}/git`));
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Git-status laden mislukt");
    }
  }, [base]);

  const loadProject = useCallback(async () => {
    const r = await api.get<{ tasks: TaskRow[]; commands: CommandRow[] }>(base);
    setTasks(r.tasks);
    setCommands(r.commands);
  }, [base]);

  useEffect(() => {
    loadTree();
    loadGit();
  }, [loadTree, loadGit]);

  async function openPath(path: string) {
    if (openFile && openFile.content !== openFile.saved && !confirm("Niet-opgeslagen wijzigingen gaan verloren. Doorgaan?")) return;
    try {
      const r = await api.get<{ content: string }>(`${base}/files?path=${encodeURIComponent(path)}`);
      setOpenFile({ path, content: r.content, saved: r.content });
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Bestand openen mislukt");
    }
  }

  async function saveFile() {
    if (!openFile) return;
    try {
      await api.put(`${base}/files`, { path: openFile.path, content: openFile.content });
      setOpenFile({ ...openFile, saved: openFile.content });
      toast.success(`${openFile.path} opgeslagen`);
      loadGit();
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Opslaan mislukt");
    }
  }

  async function newFile() {
    const path = window.prompt("Pad van het nieuwe bestand (bijv. src/nieuw.js)");
    if (!path?.trim()) return;
    try {
      await api.put(`${base}/files`, { path: path.trim(), content: "" });
      await loadTree();
      await openPath(path.trim());
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Aanmaken mislukt");
    }
  }

  async function deleteFile(path: string) {
    if (!confirm(`"${path}" verwijderen? Je kunt dit terugdraaien via Git zolang je niet commit.`)) return;
    try {
      await api.del(`${base}/files?path=${encodeURIComponent(path)}`);
      if (openFile?.path === path) setOpenFile(null);
      await loadTree();
      loadGit();
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Verwijderen mislukt");
    }
  }

  async function runCommand(command: string, allowNetwork = false) {
    setRunning(true);
    setBottom("terminal");
    try {
      const r = await api.post<{ result: { id: string; exitCode: number | null; stdout: string; stderr: string; durationMs: number; timedOut: boolean; network: boolean } }>(`${base}/commands`, { command, allowNetwork });
      setLastResult({ id: r.result.id, command, network: r.result.network, exit_code: r.result.exitCode, duration_ms: r.result.durationMs, timed_out: r.result.timedOut, created_at: new Date().toISOString(), stdout: r.result.stdout, stderr: r.result.stderr, task_id: null });
      loadProject().catch(() => {});
      loadTree();
      loadGit();
    } catch (e) {
      if (e instanceof ClientApiError && e.details?.needsNetwork) setNetworkConfirm(command);
      else toast.error(e instanceof ClientApiError ? e.message : "Commando mislukt");
    } finally {
      setRunning(false);
    }
  }

  async function startTask() {
    if (!prompt.trim()) return;
    setStarting(true);
    try {
      const [provider, ...rest] = model.split("::");
      const r = await api.post<{ id: string }>(`${base}/tasks`, { prompt: prompt.trim(), provider: provider || undefined, modelId: rest.join("::") || undefined, newBranch: taskBranch });
      setTaskId(r.id);
      router.replace(`/w/${slug}/code/${project.id}?task=${r.id}`, { scroll: false });
      await loadProject();
      toast.success("AI Code-taak gestart");
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Taak starten mislukt");
    } finally {
      setStarting(false);
    }
  }

  function openGh(kind: "push" | "pr") {
    const lastTask = tasks.find((t) => t.status === "succeeded");
    const title = (lastTask?.prompt ?? "").split("\n")[0].replace(/^\/tool.*$/, "").slice(0, 120) || `Wijzigingen ${git?.status.branch ?? ""}`.trim();
    setGhForm({ confirm: false, allowDefault: false, title, body: lastTask ? `Gemaakt met AI Code (AI WorkStudio Pro).\n\nOpdracht:\n${lastTask.prompt.slice(0, 2000)}` : "", draft: true });
    setGhDialog(kind);
  }

  async function githubAction() {
    if (!ghDialog) return;
    setGhBusy(true);
    try {
      if (ghDialog === "push") {
        const r = await api.post<{ branch: string; repo: string }>(`${base}/github`, { action: "push", confirm: true, allowDefaultBranch: ghForm.allowDefault });
        toast.success(`Branch ${r.branch} gepusht naar ${r.repo}`);
      } else {
        const r = await api.post<{ url: string; number: number }>(`${base}/github`, { action: "pull_request", confirm: true, title: ghForm.title, body: ghForm.body, draft: ghForm.draft });
        setLastPr(r.url);
        toast.success(`Pull request #${r.number} aangemaakt`, { action: { label: "Openen", onClick: () => window.open(r.url, "_blank", "noopener,noreferrer") } });
      }
      setGhDialog(null);
      loadGit();
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "GitHub-actie mislukt");
    } finally {
      setGhBusy(false);
    }
  }

  async function gitAction(body: Record<string, unknown>, ok: string) {
    try {
      await api.post(`${base}/git`, body);
      toast.success(ok);
      setCommitMsg("");
      setNewBranch("");
      await loadGit();
      loadTree();
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Git-actie mislukt");
    }
  }

  const onTaskFinished = useCallback(() => {
    loadTree();
    loadGit();
    loadProject().catch(() => {});
    if (openFile) {
      api.get<{ content: string }>(`${base}/files?path=${encodeURIComponent(openFile.path)}`)
        .then((r) => setOpenFile((f) => (f && f.content === f.saved ? { ...f, content: r.content, saved: r.content } : f)))
        .catch(() => {});
    }
  }, [loadTree, loadGit, loadProject, base, openFile]);

  const visibleTree = useMemo(() => (tree ?? []).filter((e) => {
    const parts = e.path.split("/");
    for (let i = 1; i < parts.length; i++) if (collapsed.has(parts.slice(0, i).join("/"))) return false;
    return true;
  }), [tree, collapsed]);
  const changed = new Set(git?.status.entries.map((e) => e.path) ?? []);
  const dirty = openFile && openFile.content !== openFile.saved;

  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100dvh-4rem)] lg:min-h-[640px]">
      <header className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Terug naar projecten"><Link href={`/w/${slug}/code`}><ArrowLeft /></Link></Button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight">{project.name}</h1>
          <p className="truncate text-xs text-muted-foreground">{project.source_type === "git" ? project.source_ref : `Sjabloon ${project.source_ref}`}</p>
        </div>
        {git && <Badge tone="info"><GitBranch className="size-3" /> {git.status.branch}</Badge>}
        <Badge tone={sandbox.available ? "success" : "warning"}><ServerCog className="size-3" /> Sandbox {sandbox.available ? "actief" : "niet beschikbaar"}</Badge>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => { loadTree(); loadGit(); }}><RefreshCw /> Vernieuwen</Button>
      </header>

      {!sandbox.available && <Alert tone="warning" title="Sandbox niet beschikbaar">{sandbox.reason} Bestanden bewerken werkt; commando&apos;s en AI Code-taken niet.</Alert>}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[230px_1fr] 2xl:grid-cols-[240px_1fr_400px]">
        {/* Bestanden */}
        <aside className="hidden min-h-0 flex-col rounded-2xl border border-border bg-card lg:flex" aria-label="Bestanden">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Bestanden</p>
            <button onClick={newFile} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Nieuw bestand"><FilePlus2 className="size-4" /></button>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto py-1.5 font-mono text-[12.5px]" data-testid="file-tree">
            {tree === null && <li className="flex justify-center py-6"><Spinner /></li>}
            {visibleTree.map((e) => {
              const depth = e.path.split("/").length - 1;
              const name = e.path.split("/").pop();
              const isOpen = !collapsed.has(e.path);
              return (
                <li key={e.path} className="group relative">
                  <button
                    onClick={() => {
                      if (e.type === "dir") setCollapsed((c) => { const n = new Set(c); if (n.has(e.path)) n.delete(e.path); else n.add(e.path); return n; });
                      else openPath(e.path);
                    }}
                    className={cn("flex w-full items-center gap-1.5 py-1 pr-7 text-left hover:bg-muted", openFile?.path === e.path && "bg-accent font-semibold")}
                    style={{ paddingLeft: 10 + depth * 14 }}
                  >
                    {e.type === "dir" ? (
                      <>{isOpen ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />}{isOpen ? <FolderOpen className="size-3.5 shrink-0 text-brand-sky-strong" /> : <Folder className="size-3.5 shrink-0 text-brand-sky-strong" />}</>
                    ) : <File className="ml-[18px] size-3.5 shrink-0 text-muted-foreground" />}
                    <span className={cn("truncate", changed.has(e.path) && "text-warning")}>{name}</span>
                  </button>
                  {e.type === "file" && (
                    <button onClick={() => deleteFile(e.path)} aria-label={`Verwijder ${e.path}`} className="absolute right-1.5 top-1 hidden rounded p-0.5 text-muted-foreground hover:text-danger group-hover:block"><Trash2 className="size-3.5" /></button>
                  )}
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Editor + onderpaneel */}
        <section className="flex min-h-0 min-w-0 flex-col gap-3">
          <Select aria-label="Bestand openen" className="h-9 text-[13px] lg:hidden" value={openFile?.path ?? ""} onChange={(e) => e.target.value && openPath(e.target.value)}>
            <option value="">Bestand openen…</option>
            {(tree ?? []).filter((e) => e.type === "file").map((e) => <option key={e.path} value={e.path}>{e.path}</option>)}
          </Select>
          <div className="flex h-[380px] flex-col overflow-hidden rounded-2xl border border-border bg-[#282c34] lg:h-auto lg:min-h-[260px] lg:flex-1">
            <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-slate-200">
              <span className="truncate font-mono text-[12.5px]">{openFile?.path ?? "Geen bestand geopend"}</span>
              {dirty && <span className="size-2 rounded-full bg-warning" title="Niet opgeslagen" />}
              {openFile && <Button size="sm" variant="accent" className="ml-auto h-7" onClick={saveFile} disabled={!dirty} data-testid="save-file"><Save /> Opslaan</Button>}
            </div>
            <div className="min-h-0 flex-1">
              {openFile ? (
                <CodeEditor path={openFile.path} value={openFile.content} onChange={(v) => setOpenFile((f) => (f ? { ...f, content: v } : f))} onSave={saveFile} />
              ) : (
                <div className="grid h-full place-items-center p-6 text-center text-sm text-slate-400">Kies een bestand, of laat AI Code het werk doen via het AI Code-paneel.</div>
              )}
            </div>
          </div>

          <div className="flex h-[300px] shrink-0 flex-col rounded-2xl border border-border bg-card">
            <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
              {([["terminal", Terminal, "Terminal"], ["git", GitCommitHorizontal, `Git${git?.status.entries.length ? ` (${git.status.entries.length})` : ""}`], ["history", History, "Geschiedenis"]] as const).map(([k, Icon, label]) => (
                <button key={k} onClick={() => { setBottom(k); if (k === "git") loadGit(); }} className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium", bottom === k ? "bg-muted" : "text-muted-foreground hover:text-foreground")}>
                  <Icon className="size-3.5" /> {label}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {bottom === "terminal" && (
                <div className="flex h-full flex-col gap-2">
                  <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (cmd.trim()) runCommand(cmd.trim()); }}>
                    <div className="flex flex-1 items-center gap-2 rounded-lg border border-input bg-navy-950 px-3 font-mono text-[13px] text-slate-100">
                      <span className="text-turq-300">$</span>
                      <input value={cmd} onChange={(e) => setCmd(e.target.value)} aria-label="Commando" className="h-9 flex-1 bg-transparent outline-none" placeholder="npm test" />
                    </div>
                    <Button type="submit" variant="accent" loading={running} disabled={!sandbox.available} data-testid="run-command"><Play /> Uitvoeren</Button>
                  </form>
                  <p className="text-[11px] text-muted-foreground">Draait in de sandbox zonder netwerk. Pakketinstallaties vragen eerst toestemming.</p>
                  {lastResult ? (
                    <pre className="min-h-0 flex-1 overflow-auto rounded-lg bg-navy-950 p-3 font-mono text-[12px] leading-relaxed text-slate-200" data-testid="terminal-output">
                      <span className="text-turq-300">$ {lastResult.command}</span>{"\n"}
                      {lastResult.stdout}
                      {lastResult.stderr && <span className="text-rose-300">{lastResult.stderr}</span>}
                      {"\n"}<span className={lastResult.exit_code === 0 ? "text-emerald-300" : "text-rose-300"}>{lastResult.timed_out ? "⏱ time-out" : `● exitcode ${lastResult.exit_code}`} · {((lastResult.duration_ms ?? 0) / 1000).toFixed(1)} s{lastResult.network ? " · met netwerk" : ""}</span>
                    </pre>
                  ) : <p className="text-sm text-muted-foreground">Nog geen uitvoer.</p>}
                </div>
              )}
              {bottom === "git" && (
                git ? (
                  <div className="grid gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Select aria-label="Branch" className="h-8 w-48 text-xs" value={git.branches.find((b) => b.current)?.name ?? ""} onChange={(e) => gitAction({ action: "checkout", name: e.target.value }, `Gewisseld naar ${e.target.value}`)}>
                        {git.branches.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
                      </Select>
                      <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (newBranch.trim()) gitAction({ action: "branch", name: newBranch.trim() }, `Branch ${newBranch} aangemaakt`); }}>
                        <Input value={newBranch} onChange={(e) => setNewBranch(e.target.value)} placeholder="nieuwe-branch" aria-label="Nieuwe branch" className="h-8 w-40 text-xs" />
                        <Button size="sm" variant="secondary" type="submit"><GitBranch /> Maak</Button>
                      </form>
                      <form className="ml-auto flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (commitMsg.trim()) gitAction({ action: "commit", message: commitMsg.trim() }, "Wijzigingen gecommit"); }}>
                        <Input value={commitMsg} onChange={(e) => setCommitMsg(e.target.value)} placeholder="Commitbericht" aria-label="Commitbericht" className="h-8 w-56 text-xs" />
                        <Button size="sm" variant="accent" type="submit" disabled={!git.status.entries.length || !commitMsg.trim()}><GitCommitHorizontal /> Commit</Button>
                      </form>
                    </div>
                    {git.status.entries.length > 0 && (
                      <ul className="flex flex-wrap gap-1.5">{git.status.entries.map((e) => <li key={e.path}><Badge tone={e.label === "nieuw" ? "success" : e.label === "verwijderd" ? "danger" : "warning"} className="font-mono">{e.label}: {e.path}</Badge></li>)}</ul>
                    )}
                    <DiffView diff={git.diff} className="max-h-none" />
                    {project.github_repo ? (
                      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 p-3" data-testid="github-actions">
                        <GitPullRequest className="size-4 text-brand-sky-strong dark:text-brand-sky" />
                        <span className="text-sm font-medium">GitHub: {project.github_repo}</span>
                        {lastPr && <a href={lastPr} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-sky-strong hover:underline dark:text-brand-sky">Laatste pull request <ExternalLink className="size-3" /></a>}
                        <span className="ml-auto flex gap-1.5">
                          <Button size="sm" variant="secondary" onClick={() => openGh("push")}><CloudUpload /> Pushen</Button>
                          <Button size="sm" variant="accent" onClick={() => openGh("pr")}><GitPullRequest /> Pull request</Button>
                        </span>
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">Dit project is niet aan GitHub gekoppeld; commits blijven lokaal. Open een GitHub-repository via AI Code → Nieuw project om te kunnen pushen en pull requests te maken.</p>
                    )}
                  </div>
                ) : <Spinner />
              )}
              {bottom === "history" && (
                <ul className="grid gap-1.5">
                  {commands.length === 0 && <li className="text-sm text-muted-foreground">Nog geen commando&apos;s uitgevoerd.</li>}
                  {commands.map((c) => (
                    <li key={c.id}>
                      <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted" onClick={() => { setLastResult(c); setBottom("terminal"); }}>
                        <span className={cn("size-2 rounded-full", c.exit_code === 0 ? "bg-emerald-500" : "bg-rose-500")} />
                        <code className="truncate font-mono text-[12.5px]">{c.command}</code>
                        {c.task_id && <Badge tone="turq"><Bot className="size-3" /> AI</Badge>}
                        {c.network && <Badge tone="warning">netwerk</Badge>}
                        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{timeAgo(c.created_at)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        {/* AI Code */}
        <aside className="flex min-h-[420px] flex-col rounded-2xl border border-border bg-card lg:col-span-2 lg:min-h-0 2xl:col-span-1" aria-label="AI Code-taken">
          <div className="border-b border-border p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-brand-sky-strong dark:text-brand-sky" /> Nieuwe AI Code-taak</p>
            <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} aria-label="Opdracht voor AI Code" placeholder="Beschrijf wat AI Code moet bouwen of herstellen…" />
            <div className="mt-2 flex gap-2">
              <Select aria-label="Model" className="h-9 min-w-0 flex-1 text-xs" value={model} onChange={(e) => setModel(e.target.value)}>
                {models.length === 0 && <option value="">Geen model beschikbaar</option>}
                {models.map((m) => <option key={m.value} value={m.value} disabled={!m.available}>{m.label}{m.available ? "" : " — verbinding instellen"}</option>)}
              </Select>
              <Button variant="accent" onClick={startTask} loading={starting} disabled={!prompt.trim() || !model || !sandbox.available} data-testid="start-task"><Play /> Start</Button>
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs">
              <input type="checkbox" className="accent-[#14b8a6]" checked={taskBranch} onChange={(e) => setTaskBranch(e.target.checked)} data-testid="task-new-branch" />
              Op een nieuwe branch werken (ai/…){project.github_repo ? " – aanbevolen voor een pull request" : ""}
            </label>
            <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground"><ShieldAlert className="mt-0.5 size-3 shrink-0" /> AI Code werkt alleen in deze projectmap, test in de sandbox en toont de diff. Installaties en netwerk vragen jouw toestemming. Commit doe je zelf.</p>
          </div>
          {tasks.length > 0 && (
            <div className="border-b border-border px-4 py-2">
              <Select aria-label="Kies taak" className="h-8 text-xs" value={taskId ?? ""} onChange={(e) => { setTaskId(e.target.value); router.replace(`/w/${slug}/code/${project.id}?task=${e.target.value}`, { scroll: false }); }}>
                {tasks.map((t) => <option key={t.id} value={t.id}>{(TASK_STATUS[t.status]?.label ?? t.status)} · {t.prompt.slice(0, 60)}</option>)}
              </Select>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {taskId ? <CodeTaskPanel key={taskId} slug={slug} taskId={taskId} onFinished={onTaskFinished} /> : <p className="text-sm text-muted-foreground">Nog geen taken. Start hierboven een opdracht.</p>}
          </div>
        </aside>
      </div>

      <Dialog open={Boolean(ghDialog)} onOpenChange={(o) => !o && setGhDialog(null)}>
        {ghDialog && (
          <DialogContent title={ghDialog === "push" ? "Naar GitHub pushen" : "Pull request maken"} description={`Repository ${project.github_repo} · branch ${git?.status.branch ?? "?"}`}>
            <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); githubAction(); }}>
              {ghDialog === "pr" && (
                <>
                  <label className="grid gap-1 text-sm font-medium">Titel<Input value={ghForm.title} onChange={(e) => setGhForm({ ...ghForm, title: e.target.value })} required minLength={3} maxLength={200} /></label>
                  <label className="grid gap-1 text-sm font-medium">Omschrijving<Textarea rows={5} value={ghForm.body} onChange={(e) => setGhForm({ ...ghForm, body: e.target.value })} maxLength={20000} /></label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[#14b8a6]" checked={ghForm.draft} onChange={(e) => setGhForm({ ...ghForm, draft: e.target.checked })} /> Als concept (draft) openen</label>
                </>
              )}
              {ghDialog === "push" && git?.status.branch === (project.default_branch ?? "main") && (
                <label className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/8 p-2.5 text-sm">
                  <input type="checkbox" className="mt-0.5 accent-[#f59e0b]" checked={ghForm.allowDefault} onChange={(e) => setGhForm({ ...ghForm, allowDefault: e.target.checked })} />
                  Je staat op de hoofdbranch. Ik wil bewust rechtstreeks naar &quot;{project.default_branch ?? "main"}&quot; pushen.
                </label>
              )}
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-0.5 accent-[#14b8a6]" checked={ghForm.confirm} onChange={(e) => setGhForm({ ...ghForm, confirm: e.target.checked })} required data-testid="gh-confirm" />
                Ik bevestig dat mijn gecommitte wijzigingen naar GitHub worden verstuurd{ghDialog === "pr" ? " en dat er een pull request wordt geopend" : ""}.
              </label>
              <Button type="submit" variant="accent" loading={ghBusy} disabled={!ghForm.confirm}>{ghDialog === "push" ? <><CloudUpload /> Pushen</> : <><GitPullRequest /> Pushen en pull request maken</>}</Button>
            </form>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={Boolean(networkConfirm)} onOpenChange={(o) => !o && setNetworkConfirm(null)}>
        <DialogContent title="Netwerktoegang toestaan?" description="Dit commando installeert pakketten en heeft daarvoor internet nodig.">
          <code className="block rounded-lg bg-navy-950 px-3 py-2 font-mono text-[12.5px] text-slate-100">{networkConfirm}</code>
          <p className="mt-3 text-sm text-muted-foreground">Het commando draait in de afgeschermde sandbox, alleen voor dit project, en wordt vastgelegd in het auditlog. Installeer alleen pakketten die je vertrouwt.</p>
          <div className="mt-4 flex gap-2">
            <Button variant="accent" onClick={() => { const c = networkConfirm!; setNetworkConfirm(null); runCommand(c, true); }}>Toestaan en uitvoeren</Button>
            <Button variant="secondary" onClick={() => setNetworkConfirm(null)}>Annuleren</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
