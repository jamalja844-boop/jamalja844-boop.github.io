"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Boxes, FolderGit2, GitBranch, Plus, ServerCog, ShieldCheck, Trash2 } from "lucide-react";
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
  const [form, setForm] = useState({ name: "", description: "", source: "template" as "template" | "git", template: "node-starter" as "node-starter" | "empty", url: "", branch: "" });

  async function create() {
    setBusy(true);
    try {
      const source = form.source === "template" ? { type: "template", template: form.template } : { type: "git", url: form.url.trim(), branch: form.branch.trim() || undefined };
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
              <Select id="p-source" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value as "template" | "git" })}>
                <option value="template">Sjabloon</option>
                <option value="git">Openbare Git-repository (https)</option>
              </Select>
            </Field>
            {form.source === "template" ? (
              <Field label="Sjabloon" htmlFor="p-template">
                <Select id="p-template" value={form.template} onChange={(e) => setForm({ ...form, template: e.target.value as "node-starter" | "empty" })}>
                  <option value="node-starter">Node.js-voorbeeld: offerteberekening met tests</option>
                  <option value="empty">Leeg project</option>
                </Select>
              </Field>
            ) : (
              <>
                <Field label="Repository-URL" htmlFor="p-url" hint={`Alleen https en toegestane hosts: ${allowedHosts.join(", ")}. Privérepositories volgen met de GitHub-koppeling.`}>
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
