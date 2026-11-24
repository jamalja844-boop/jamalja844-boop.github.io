"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Archive, CheckCircle2, Download, FileText, History, Mail, Plus, RotateCcw, Save, Search, Share2, Star, Trash2, UserCog,
} from "lucide-react";
import { DOCUMENT_KINDS, type DocumentKind } from "@workstudio/shared";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Badge, EmptyState, Spinner } from "@/components/ui/misc";
import { Dialog, DialogContent, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { Markdown } from "@/components/chat/markdown";
import { api, ClientApiError } from "@/lib/client/api";
import { cn, formatDate, timeAgo } from "@/lib/utils";
import type { StyleOption } from "@/components/chat/chat-workspace";

export const KIND_LABEL: Record<DocumentKind, string> = {
  email: "E-mail", reply: "Antwoord", document: "Document", report: "Rapport", translation: "Vertaling", summary: "Samenvatting",
  analysis: "Analyse", message: "Bericht", other: "Overig",
};

interface DocSummary {
  id: string;
  title: string;
  kind: DocumentKind;
  status: "draft" | "approved" | "archived";
  shared: boolean;
  version: number;
  updated_at: string;
  mine: boolean;
  author: string | null;
  preview: string;
}

interface DocFull extends Omit<DocSummary, "preview"> {
  content: string;
  approved_at: string | null;
  approved_by_name: string | null;
  source_conversation_id: string | null;
}

interface VersionRow {
  version: number;
  title: string;
  note: string;
  created_at: string;
  length: number;
  author: string | null;
}

interface Prefs {
  instructions: string;
  default_style_id: string | null;
  default_language: string;
}

const STATUS: Record<DocSummary["status"], { label: string; tone: "neutral" | "success" | "warning" }> = {
  draft: { label: "Concept", tone: "warning" },
  approved: { label: "Goedgekeurd", tone: "success" },
  archived: { label: "Gearchiveerd", tone: "neutral" },
};

export function WritingStudio({ slug, initialStyles, initialPrefs, canManageStyles }: { slug: string; initialStyles: StyleOption[]; initialPrefs: Prefs; canManageStyles: boolean }) {
  const search = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState(search.get("tab") === "styles" ? "styles" : "documents");
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-sky-strong dark:text-brand-sky">Schrijfstudio</p>
          <h1 className="text-2xl font-semibold tracking-tight">Documenten en schrijfstijl</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Alle teksten uit AI Chat met versiegeschiedenis. Keur een concept goed voordat het extern wordt gebruikt.</p>
        </div>
      </div>
      <Tabs value={tab} onValueChange={(v) => { setTab(v); router.replace(`/w/${slug}/writing${v === "styles" ? "?tab=styles" : ""}`, { scroll: false }); }}>
        <TabsList>
          <TabsTrigger value="documents"><FileText className="size-4" /> Documenten</TabsTrigger>
          <TabsTrigger value="styles"><UserCog className="size-4" /> Stijlen en instructies</TabsTrigger>
        </TabsList>
        <TabsContent value="documents"><DocumentsTab slug={slug} /></TabsContent>
        <TabsContent value="styles"><StylesTab slug={slug} initialStyles={initialStyles} initialPrefs={initialPrefs} canManage={canManageStyles} /></TabsContent>
      </Tabs>
    </div>
  );
}

function DocumentsTab({ slug }: { slug: string }) {
  const search = useSearchParams();
  const router = useRouter();
  const base = `/api/w/${slug}/writing/documents`;
  const [docs, setDocs] = useState<DocSummary[] | null>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [activeId, setActiveId] = useState<string | null>(search.get("doc"));

  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (kind) p.set("kind", kind);
    if (status) p.set("status", status);
    try {
      const r = await api.get<{ documents: DocSummary[] }>(`${base}?${p}`);
      setDocs(r.documents);
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Documenten laden mislukt");
    }
  }, [base, q, kind, status]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  function open(id: string | null) {
    setActiveId(id);
    router.replace(id ? `/w/${slug}/writing?doc=${id}` : `/w/${slug}/writing`, { scroll: false });
  }

  async function createBlank() {
    try {
      const r = await api.post<{ id: string }>(base, { title: "Nieuw document", kind: "document", content: "", metadata: {}, shared: false });
      await load();
      open(r.id);
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Aanmaken mislukt");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
      <aside className="flex min-h-0 flex-col rounded-2xl border border-border bg-card lg:h-[calc(100dvh-14rem)]">
        <div className="grid gap-2 border-b border-border p-3">
          <div className="flex gap-2">
            <label className="relative block flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek op titel of inhoud" aria-label="Zoek documenten"
                className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-2 text-[13px] outline-none focus:ring-2 focus:ring-ring/40" />
            </label>
            <Button size="icon" variant="accent" onClick={createBlank} aria-label="Nieuw document"><Plus /></Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select aria-label="Soort" className="h-8 text-xs" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">Alle soorten</option>
              {DOCUMENT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </Select>
            <Select aria-label="Status" className="h-8 text-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Actief</option>
              <option value="draft">Concept</option>
              <option value="approved">Goedgekeurd</option>
              <option value="archived">Gearchiveerd</option>
            </Select>
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto p-2" data-testid="document-list">
          {docs === null && <li className="flex justify-center py-8"><Spinner /></li>}
          {docs?.length === 0 && <li className="px-3 py-8 text-center text-xs text-muted-foreground">Nog geen documenten. Sla een antwoord uit AI Chat op of maak een nieuw document.</li>}
          {docs?.map((d) => (
            <li key={d.id}>
              <button onClick={() => open(d.id)} className={cn("w-full rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted", d.id === activeId && "bg-accent")}>
                <span className="flex items-center gap-2">
                  {d.kind === "email" || d.kind === "reply" ? <Mail className="size-3.5 shrink-0 text-brand-sky-strong dark:text-brand-sky" /> : <FileText className="size-3.5 shrink-0 text-brand-sky-strong dark:text-brand-sky" />}
                  <span className="truncate text-[13px] font-semibold">{d.title}</span>
                </span>
                <span className="mt-1 line-clamp-2 text-xs text-muted-foreground">{d.preview.replace(/^\s*\[DEMO[^\]]*\]\s*/i, "") || "Leeg document"}</span>
                <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Badge tone={STATUS[d.status].tone}>{STATUS[d.status].label}</Badge>
                  <Badge>{KIND_LABEL[d.kind]}</Badge>
                  {d.shared && <Badge tone="info"><Share2 className="size-3" /> gedeeld</Badge>}
                  <span className="ml-auto text-[11px] text-muted-foreground">v{d.version} · {timeAgo(d.updated_at)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="min-h-[480px] rounded-2xl border border-border bg-card">
        {activeId ? (
          <DocumentEditor key={activeId} slug={slug} id={activeId} onChanged={load} onDeleted={() => { open(null); load(); }} />
        ) : (
          <div className="grid h-full place-items-center p-8">
            <EmptyState icon={<FileText />} title="Kies een document" description="Open een document om het te bewerken, versies te bekijken, goed te keuren of te exporteren." />
          </div>
        )}
      </section>
    </div>
  );
}

function DocumentEditor({ slug, id, onChanged, onDeleted }: { slug: string; id: string; onChanged: () => void; onDeleted: () => void }) {
  const url = `/api/w/${slug}/writing/documents/${id}`;
  const [doc, setDoc] = useState<DocFull | null>(null);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [kind, setKind] = useState<DocumentKind>("document");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [busy, setBusy] = useState(false);
  const [viewVersion, setViewVersion] = useState<{ version: number; title: string; content: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ document: DocFull; versions: VersionRow[] }>(url);
      setDoc(r.document);
      setVersions(r.versions);
      setTitle(r.document.title);
      setContent(r.document.content);
      setKind(r.document.kind);
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Document laden mislukt");
    }
  }, [url]);
  useEffect(() => {
    load();
  }, [load]);

  const dirty = doc && (title !== doc.title || content !== doc.content);
  const words = useMemo(() => (content.trim() ? content.trim().split(/\s+/).length : 0), [content]);

  async function patch(body: Record<string, unknown>, ok: string) {
    setBusy(true);
    try {
      await api.patch(url, body);
      toast.success(ok);
      setNote("");
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Opslaan mislukt");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Dit document en alle versies definitief verwijderen?")) return;
    try {
      await api.del(url);
      toast.success("Document verwijderd");
      onDeleted();
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Verwijderen mislukt");
    }
  }

  async function showVersion(v: number) {
    try {
      const r = await api.get<{ version: { version: number; title: string; content: string } }>(`${url}/versions/${v}`);
      setViewVersion(r.version);
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Versie laden mislukt");
    }
  }

  if (!doc) return <div className="flex justify-center py-16"><Spinner /></div>;
  const readOnly = !doc.mine && !doc.shared;

  return (
    <div className="grid h-full grid-cols-1 gap-0 xl:grid-cols-[1fr_260px]">
      <div className="flex min-w-0 flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS[doc.status].tone} data-testid="doc-status">{STATUS[doc.status].label}</Badge>
          <span className="text-xs text-muted-foreground">Versie {doc.version} · {doc.author ?? "onbekend"} · bijgewerkt {timeAgo(doc.updated_at)}</span>
          {doc.status === "approved" && doc.approved_by_name && <span className="text-xs text-muted-foreground">· goedgekeurd door {doc.approved_by_name}</span>}
        </div>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Titel" maxLength={200} className="h-11 text-lg font-semibold" disabled={readOnly} />
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="Soort document" className="h-8 w-40 text-xs" value={kind} disabled={readOnly} onChange={(e) => { const k = e.target.value as DocumentKind; setKind(k); patch({ kind: k }, "Soort opgeslagen"); }}>
            {DOCUMENT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </Select>
          <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
            <button className={cn("rounded-md px-2.5 py-1", mode === "edit" && "bg-muted font-semibold")} onClick={() => setMode("edit")}>Bewerken</button>
            <button className={cn("rounded-md px-2.5 py-1", mode === "preview" && "bg-muted font-semibold")} onClick={() => setMode("preview")}>Voorbeeld</button>
          </div>
          <span className="ml-auto text-xs text-muted-foreground">{words} woorden</span>
        </div>
        {mode === "edit" ? (
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} aria-label="Inhoud" rows={20} disabled={readOnly} spellCheck lang="nl"
            className="min-h-[360px] flex-1 font-[450] leading-relaxed" data-testid="doc-content" />
        ) : (
          <div className="prose-chat min-h-[360px] rounded-xl border border-border bg-background p-4 text-[14.5px] leading-relaxed"><Markdown text={content || "_Leeg document_"} /></div>
        )}
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notitie bij deze versie (optioneel)" aria-label="Versienotitie" className="h-9 max-w-xs text-[13px]" />
            <Button variant="accent" loading={busy} disabled={!dirty} onClick={() => patch({ title, content, versionNote: note }, "Nieuwe versie opgeslagen")} data-testid="doc-save"><Save /> Opslaan</Button>
            {doc.status !== "approved" ? (
              <Button variant="secondary" disabled={busy || Boolean(dirty)} title={dirty ? "Sla eerst je wijzigingen op" : undefined} onClick={() => patch({ status: "approved" }, "Document goedgekeurd")} data-testid="doc-approve"><CheckCircle2 /> Goedkeuren</Button>
            ) : (
              <Button variant="secondary" disabled={busy} onClick={() => patch({ status: "draft" }, "Terug naar concept")}><RotateCcw /> Terug naar concept</Button>
            )}
            {doc.mine && (
              <Button variant="ghost" disabled={busy} onClick={() => patch({ shared: !doc.shared }, doc.shared ? "Niet meer gedeeld" : "Gedeeld met workspace")}><Share2 /> {doc.shared ? "Delen stoppen" : "Delen"}</Button>
            )}
            {doc.status !== "archived" && <Button variant="ghost" disabled={busy} onClick={() => patch({ status: "archived" }, "Gearchiveerd")}><Archive /> Archiveren</Button>}
            {doc.mine && <Button variant="ghost" className="text-danger" onClick={remove}><Trash2 /> Verwijderen</Button>}
          </div>
        )}
        {dirty && doc.status === "approved" && <p className="text-xs text-warning">Let op: na opslaan gaat dit goedgekeurde document terug naar concept en moet het opnieuw worden goedgekeurd.</p>}
      </div>
      <aside className="flex flex-col gap-4 border-t border-border p-4 xl:border-l xl:border-t-0">
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"><Download className="size-3.5" /> Exporteren</p>
          <div className="grid grid-cols-3 gap-1.5">
            {([["docx", "Word"], ["pdf", "PDF"], ["xlsx", "Excel"]] as const).map(([f, label]) => (
              <Button key={f} asChild variant="accent" size="sm"><a href={`${url}/export?format=${f}`} data-testid={`export-${f}`}>{label}</a></Button>
            ))}
            {(["md", "txt", "html"] as const).map((f) => (
              <Button key={f} asChild variant="secondary" size="sm"><a href={`${url}/export?format=${f}`}>.{f}</a></Button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">Word en PDF met bedrijfsnaam, versie en paginanummers. Excel bevat de tabellen uit het document.</p>
        </div>
        <div className="min-h-0">
          <p className="mb-2 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"><History className="size-3.5" /> Versies</p>
          <ul className="grid max-h-80 gap-1 overflow-y-auto" data-testid="doc-versions">
            {versions.map((v) => (
              <li key={v.version}>
                <button onClick={() => showVersion(v.version)} className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-muted">
                  <span className="flex items-center gap-2 text-[13px] font-medium">v{v.version}{v.version === doc.version && <Star className="size-3 text-turq-500" />}<span className="ml-auto text-[11px] font-normal text-muted-foreground">{formatDate(v.created_at)}</span></span>
                  <span className="block truncate text-[11px] text-muted-foreground">{v.note || v.title} · {v.author ?? "–"}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <Dialog open={Boolean(viewVersion)} onOpenChange={(o) => !o && setViewVersion(null)}>
        {viewVersion && (
          <DialogContent wide title={`Versie ${viewVersion.version}: ${viewVersion.title}`} description="Bekijk een eerdere versie of zet hem terug als nieuwe versie.">
            <div className="prose-chat max-h-[55vh] overflow-y-auto rounded-xl border border-border bg-background p-4 text-sm"><Markdown text={viewVersion.content || "_Leeg_"} /></div>
            {!readOnly && viewVersion.version !== doc.version && (
              <Button className="mt-3" variant="accent" onClick={() => { const v = viewVersion; setViewVersion(null); patch({ title: v.title, content: v.content, versionNote: `Teruggezet naar versie ${v.version}` }, `Versie ${v.version} teruggezet`); }}>
                <RotateCcw /> Deze versie terugzetten
              </Button>
            )}
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function StylesTab({ slug, initialStyles, initialPrefs, canManage }: { slug: string; initialStyles: StyleOption[]; initialPrefs: Prefs; canManage: boolean }) {
  const [styles, setStyles] = useState(initialStyles);
  const [prefs, setPrefs] = useState(initialPrefs);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<Partial<StyleOption> | null>(null);
  const base = `/api/w/${slug}/writing`;

  const reload = async () => setStyles((await api.get<{ styles: StyleOption[] }>(`${base}/styles`)).styles);

  async function savePrefs() {
    setBusy(true);
    try {
      await api.put(`${base}/preferences`, { instructions: prefs.instructions, defaultStyleId: prefs.default_style_id, defaultLanguage: prefs.default_language });
      toast.success("Persoonlijke instructies opgeslagen");
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Opslaan mislukt");
    } finally {
      setBusy(false);
    }
  }

  async function saveStyle() {
    if (!edit) return;
    setBusy(true);
    try {
      const body = { name: edit.name, description: edit.description ?? "", instructions: edit.instructions, isDefault: Boolean(edit.is_default) };
      if (edit.id) await api.patch(`${base}/styles/${edit.id}`, body);
      else await api.post(`${base}/styles`, body);
      toast.success("Schrijfstijl opgeslagen");
      setEdit(null);
      await reload();
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Opslaan mislukt");
    } finally {
      setBusy(false);
    }
  }

  async function removeStyle(id: string) {
    if (!confirm("Deze schrijfstijl verwijderen?")) return;
    try {
      await api.del(`${base}/styles/${id}`);
      await reload();
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Verwijderen mislukt");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Schrijfstijlen van de organisatie</h2>
            <p className="text-sm text-muted-foreground">Elke AI-tekst volgt de gekozen stijl. De standaardstijl geldt voor iedereen, tenzij iemand een eigen voorkeur kiest.</p>
          </div>
          {canManage && <Button size="sm" variant="accent" onClick={() => setEdit({ name: "", description: "", instructions: "", is_default: false })}><Plus /> Stijl</Button>}
        </div>
        <ul className="grid gap-3">
          {styles.map((s) => (
            <li key={s.id} className="rounded-xl border border-border p-4">
              <div className="flex items-center gap-2">
                <p className="font-semibold">{s.name}</p>
                {s.is_default && <Badge tone="turq">Standaard</Badge>}
                {canManage && (
                  <span className="ml-auto flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEdit(s)}>Bewerken</Button>
                    {!s.is_default && <Button size="sm" variant="ghost" className="text-danger" onClick={() => removeStyle(s.id)} aria-label={`Verwijder ${s.name}`}><Trash2 /></Button>}
                  </span>
                )}
              </div>
              {s.description && <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>}
              <p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-[13px] leading-relaxed">{s.instructions}</p>
            </li>
          ))}
        </ul>
      </section>
      <section className="h-fit rounded-2xl border border-border bg-card p-5">
        <h2 className="font-semibold">Mijn persoonlijke instructies</h2>
        <p className="mb-4 text-sm text-muted-foreground">Alleen zichtbaar voor jou. Worden bij elke AI-tekst meegestuurd.</p>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); savePrefs(); }}>
          <Field label="Voorkeursstijl" htmlFor="pref-style">
            <Select id="pref-style" value={prefs.default_style_id ?? ""} onChange={(e) => setPrefs({ ...prefs, default_style_id: e.target.value || null })}>
              <option value="">Standaardstijl van de organisatie</option>
              {styles.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Standaardtaal" htmlFor="pref-lang">
            <Input id="pref-lang" value={prefs.default_language} onChange={(e) => setPrefs({ ...prefs, default_language: e.target.value })} maxLength={40} />
          </Field>
          <Field label="Instructies" htmlFor="pref-instr" hint="Bijv. ondertekening, aanspreekvorm (u/je), woorden die je liever niet gebruikt.">
            <Textarea id="pref-instr" rows={7} value={prefs.instructions} onChange={(e) => setPrefs({ ...prefs, instructions: e.target.value })} maxLength={8000}
              placeholder="Onderteken met: Met vriendelijke groet, …&#10;Spreek klanten aan met u." />
          </Field>
          <Button type="submit" variant="accent" loading={busy}><Save /> Opslaan</Button>
        </form>
      </section>
      <Dialog open={Boolean(edit)} onOpenChange={(o) => !o && setEdit(null)}>
        {edit && (
          <DialogContent title={edit.id ? "Schrijfstijl bewerken" : "Nieuwe schrijfstijl"}>
            <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); saveStyle(); }}>
              <Field label="Naam" htmlFor="st-name"><Input id="st-name" value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required minLength={2} maxLength={80} /></Field>
              <Field label="Korte omschrijving" htmlFor="st-desc"><Input id="st-desc" value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} maxLength={300} /></Field>
              <Field label="Instructies voor de AI" htmlFor="st-instr"><Textarea id="st-instr" rows={8} value={edit.instructions ?? ""} onChange={(e) => setEdit({ ...edit, instructions: e.target.value })} required minLength={10} maxLength={8000} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[#14b8a6]" checked={Boolean(edit.is_default)} onChange={(e) => setEdit({ ...edit, is_default: e.target.checked })} /> Standaardstijl van de organisatie</label>
              <Button type="submit" variant="accent" loading={busy}><Save /> Opslaan</Button>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
