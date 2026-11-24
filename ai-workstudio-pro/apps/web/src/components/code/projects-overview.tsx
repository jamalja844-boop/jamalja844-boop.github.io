"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Boxes, FolderGit2, GitBranch, GitPullRequest, Plus, ServerCog, ShieldCheck, Trash2, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Badge, EmptyState } from "@/components/ui/misc";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { TASK_STATUS } from "@/components/code/task-view";
import { api, ClientApiError } from "@/lib/client/api";
import { timeAgo } from "@/lib/utils";

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  source_type: "template" | "git" | "local";
  source_ref: string;
  status: "preparing" | "ready" | "failed";
  error: string | null;
  created_at: string;
  last_opened_at: string | null;
  task_count: number;
  last_task_status: string | null;
}

interface GithubStatus { configured: boolean; connected: { login: string; scopes: string; connectedAt: string } | null }
interface GhRepo { full_name: string; private: boolean; default_branch: string; description: string | null; updated_at: string; permissions?: { push?: boolean } }

export interface SandboxInfo {
  available: boolean;
  reason?: string | null;
  dockerVersion?: string | null;
}

export function ProjectsOverview({ slug, initialProjects, sandbox, canManage, allowedHosts }: { slug: string; initialProjects: ProjectSummary[]; sandbox: SandboxInfo; canManage: boolean; allowedHosts: string[] }) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", source: "template" as "template" | "git" | "github", template: "node-starter" as "node-starter" | "empty", url: "", branch: "", repo: "" });
  const search = useSearchParams();
  const [gh, setGh] = useState<GithubStatus | null>(null);
  const [repos, setRepos] = useState<GhRepo[] | null>(null);
  const [repoFilter, setRepoFilter] = useState("");

  const loadGh = useCallback(async () => {
    try {
      setGh(await api.get<GithubStatus>(`/api/w/${slug}/integrations/github`));
    } catch {
      setGh({ configured: false, connected: null });
    }
  }, [slug]);
  useEffect(() => {
    loadGh();
    const ok = search.get("github");
    const err = search.get("github_error");
    if (ok) toast.success(`GitHub gekoppeld als @${ok}`);
    if (err) toast.error(`GitHub: ${err}`);
    if (ok || err) router.replace(`/w/${slug}/code`, { scroll: false });
  }, [loadGh, search, router, slug]);

  async function loadRepos() {
    try {
      setRepos((await api.get<{ repos: GhRepo[] }>(`/api/w/${slug}/integrations/github/repos`)).repos);
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Repository's laden mislukt");
      setRepos([]);
    }
  }

  async function disconnect() {
    if (!confirm("GitHub ontkoppelen? Het token wordt verwijderd en de toestemming bij GitHub ingetrokken.")) return;
    try {
      await api.del(`/api/w/${slug}/integrations/github`);
      toast.success("GitHub ontkoppeld");
      setRepos(null);
      await loadGh();
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Ontkoppelen mislukt");
    }
  }

  async function create() {
    setBusy(true);
    try {
      const source = form.source === "template"
        ? { type: "template", template: form.template }
        : form.source === "github"
          ? { type: "github", repo: form.repo, branch: form.branch.trim() || undefined }
          : { type: "git", url: form.url.trim(), branch: form.branch.trim() || undefined };
      const r = await api.post<{ id: string }>(`/api/w/${slug}/code/projects`, { name: form.name.trim(), description: form.description.trim(), source });
      toast.success("Project aangemaakt");
      setOpen(false);
      router.push(`/w/${slug}/code/${r.id}`);
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Project aanmaken mislukt");
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: ProjectSummary) {
    if (!confirm(`Project "${p.name}" en alle bestanden in de werkmap definitief verwijderen?`)) return;
    try {
      await api.del(`/api/w/${slug}/code/projects/${p.id}`);
      setProjects((ps) => ps.filter((x) => x.id !== p.id));
      toast.success("Project verwijderd");
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Verwijderen mislukt");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-sky-strong dark:text-brand-sky">AI Code</p>
          <h1 className="text-2xl font-semibold tracking-tight">Projecten</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Elk project heeft een eigen werkmap. Commando&apos;s en tests draaien in een afgeschermde container zonder netwerk; installaties vragen eerst jouw toestemming.</p>
        </div>
        {canManage && <Button variant="accent" onClick={() => setOpen(true)} data-testid="new-project"><Plus /> Nieuw project</Button>}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
          <ServerCog className={sandbox.available ? "size-5 text-turq-500" : "size-5 text-warning"} />
          <div className="min-w-0">
            <p className="text-sm font-semibold">Sandbox {sandbox.available ? "actief" : "niet beschikbaar"}</p>
            <p className="truncate text-xs text-muted-foreground">{sandbox.available ? `Docker ${sandbox.dockerVersion ?? ""} · geen netwerk standaard` : sandbox.reason}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
          <ShieldCheck className="size-5 text-brand-sky-strong dark:text-brand-sky" />
          <div><p className="text-sm font-semibold">Afgeschermd</p><p className="text-xs text-muted-foreground">Geen rootrechten, alleen-lezen systeem, limieten op CPU/geheugen</p></div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
          <GitBranch className="size-5 text-brand-sky-strong dark:text-brand-sky" />
          <div><p className="text-sm font-semibold">Git per project</p><p className="text-xs text-muted-foreground">Status, diff, branches en commits; klonen van {allowedHosts.join(", ")}</p></div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4" data-testid="github-card">
        <GitPullRequest className="size-5 text-brand-sky-strong dark:text-brand-sky" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">GitHub</p>
          <p className="text-xs text-muted-foreground">
            {!gh ? "Status laden…" : !gh.configured
              ? "Nog niet ingesteld op de server: GITHUB_CLIENT_ID en GITHUB_CLIENT_SECRET ontbreken in .env (GitHub → Developer settings → OAuth Apps)."
              : gh.connected ? `Gekoppeld als @${gh.connected.login} – privé-repository's klonen, pushen en pull requests (altijd na jouw bevestiging).`
                : "Koppel je eigen GitHub-account om privé-repository's te openen, te pushen en pull requests te maken."}
          </p>
        </div>
        {gh?.configured && !gh.connected && <Button asChild variant="accent" size="sm"><a href={`/api/w/${slug}/integrations/github/start`}><GitPullRequest /> GitHub koppelen</a></Button>}
        {gh?.connected && <Button variant="ghost" size="sm" onClick={disconnect}><Unplug /> Ontkoppelen</Button>}
      </div>

      {!sandbox.available && (
        <Alert tone="warning" title="Commando's en AI Code-taken kunnen nog niet draaien">
          {sandbox.reason} Installeer Docker op de server en zorg dat de webserver/worker het image <code>node:22-alpine</code> (of SANDBOX_IMAGE) kan gebruiken. Bestanden bekijken en bewerken werkt wel.
        </Alert>
      )}

      {projects.length === 0 ? (
        <EmptyState icon={<Boxes />} title="Nog geen projecten" description="Start met het voorbeeldproject (offerteberekening met tests) of kloon een openbare Git-repository." action={canManage ? <Button variant="accent" onClick={() => setOpen(true)}><Plus /> Nieuw project</Button> : undefined} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="project-list">
          {projects.map((p) => {
            const last = p.last_task_status ? TASK_STATUS[p.last_task_status] : null;
            return (
              <li key={p.id} className="group relative rounded-2xl border border-border bg-card p-4 transition hover:border-brand-sky/50 hover:shadow-md">
                <Link href={`/w/${slug}/code/${p.id}`} className="absolute inset-0 rounded-2xl" aria-label={`Open ${p.name}`} />
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-sky/20 to-turq-400/20 text-brand-sky-strong dark:text-brand-sky"><FolderGit2 className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.source_type === "git" ? p.source_ref : `Sjabloon: ${p.source_ref}`}</p>
                  </div>
                  {canManage && (
                    <button onClick={() => remove(p)} className="relative z-10 hidden rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-danger group-hover:block" aria-label={`Verwijder ${p.name}`}><Trash2 className="size-4" /></button>
                  )}
                </div>
                {p.description && <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Badge tone={p.status === "ready" ? "success" : p.status === "failed" ? "danger" : "warning"}>{p.status === "ready" ? "Klaar" : p.status === "failed" ? "Mislukt" : "Voorbereiden"}</Badge>
                  <Badge>{p.task_count} taken</Badge>
                  {last && <Badge tone={last.tone}>Laatste: {last.label}</Badge>}
                  <span className="ml-auto text-[11px] text-muted-foreground">{timeAgo(p.last_opened_at ?? p.created_at)}</span>
                </div>
                {p.error && <p className="mt-2 text-xs text-danger">{p.error}</p>}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Nieuw project" description="Het project krijgt een eigen, afgeschermde werkmap op de server.">
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); create(); }}>
            <Field label="Naam" htmlFor="p-name"><Input id="p-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={80} placeholder="Offertecalculator" /></Field>
            <Field label="Omschrijving" htmlFor="p-desc"><Textarea id="p-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={500} /></Field>
            <Field label="Bron" htmlFor="p-source">
              <Select id="p-source" value={form.source} onChange={(e) => {
                const v = e.target.value as "template" | "git" | "github";
                setForm({ ...form, source: v });
                if (v === "github" && repos === null) loadRepos();
              }}>
                <option value="template">Sjabloon</option>
                <option value="git">Openbare Git-repository (https)</option>
                <option value="github" disabled={!gh?.connected}>Mijn GitHub-repository&apos;s{gh?.connected ? " (ook privé)" : " – koppel eerst GitHub"}</option>
              </Select>
            </Field>
            {form.source === "template" ? (
              <Field label="Sjabloon" htmlFor="p-template">
                <Select id="p-template" value={form.template} onChange={(e) => setForm({ ...form, template: e.target.value as "node-starter" | "empty" })}>
                  <option value="node-starter">Node.js-voorbeeld: offerteberekening met tests</option>
                  <option value="empty">Leeg project</option>
                </Select>
              </Field>
            ) : form.source === "github" ? (
              <>
                <Field label="Repository" htmlFor="p-repo" hint="Gekloond met jouw token; het token komt niet in de projectmap.">
                  <div className="grid gap-2">
                    <Input value={repoFilter} onChange={(e) => setRepoFilter(e.target.value)} placeholder="Zoeken…" aria-label="Zoek repository" />
                    <Select id="p-repo" value={form.repo} required onChange={(e) => {
                      const r = repos?.find((x) => x.full_name === e.target.value);
                      setForm({ ...form, repo: e.target.value, name: form.name || (r?.full_name.split("/")[1] ?? ""), branch: r?.default_branch ?? "" });
                    }}>
                      <option value="">{repos === null ? "Laden…" : repos.length ? "Kies een repository" : "Geen repository's gevonden"}</option>
                      {(repos ?? []).filter((r) => r.full_name.toLowerCase().includes(repoFilter.toLowerCase())).map((r) => (
                        <option key={r.full_name} value={r.full_name}>{r.private ? "🔒 " : ""}{r.full_name}{r.permissions?.push ? "" : " (alleen lezen)"}</option>
                      ))}
                    </Select>
                  </div>
                </Field>
                <Field label="Branch" htmlFor="p-branch"><Input id="p-branch" value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} placeholder="main" /></Field>
              </>
            ) : (
              <>
                <Field label="Repository-URL" htmlFor="p-url" hint={`Alleen https en toegestane hosts: ${allowedHosts.join(", ")}. Voor privé-repository's: kies "Mijn GitHub-repository's".`}>
                  <Input id="p-url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} required placeholder="https://github.com/organisatie/repository" />
                </Field>
                <Field label="Branch (optioneel)" htmlFor="p-branch"><Input id="p-branch" value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} placeholder="main" /></Field>
              </>
            )}
            <Button type="submit" variant="accent" loading={busy} data-testid="create-project"><Plus /> Project aanmaken</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
