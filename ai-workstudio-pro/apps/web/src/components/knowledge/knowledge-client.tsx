"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookOpen, FileText, Library, Plus, RefreshCw, Search, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Badge, EmptyState, StatusBadge } from "@/components/ui/misc";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { Markdown } from "@/components/chat/markdown";
import { ModelSelect, defaultModel, parseModelValue } from "@/components/shared/model-select";
import { api, ClientApiError } from "@/lib/client/api";
import type { StudioOptions } from "@/lib/studio-options";
import { cn, formatNumber, timeAgo } from "@/lib/utils";

interface KB { id: string; name: string; description: string; min_role: string; embedding_model: string | null; documents: number; chunks: number }
interface Doc { id: string; title: string; filename: string; size_bytes: number; min_role: string; status: string; error: string | null; chunk_count: number; has_embeddings: boolean; created_at: string }

const ROLES = [
  ["viewer", "Iedereen (kijker+)"],
  ["member", "Medewerkers+"],
  ["developer", "Ontwikkelaars+"],
  ["admin", "Beheerders+"],
  ["owner", "Alleen eigenaren"],
] as const;
const err = (e: unknown) => (e instanceof ClientApiError ? e.message : "Er ging iets mis");

export function KnowledgeClient({ slug, kbs, docsByKb, options, canManage }: { slug: string; kbs: KB[]; docsByKb: Record<string, Doc[]>; options: StudioOptions; canManage: boolean }) {
  const router = useRouter();
  const [activeKb, setActiveKb] = useState(kbs[0]?.id ?? null);
  const [uploading, setUploading] = useState(false);
  const [minRole, setMinRole] = useState("viewer");
  const [newOpen, setNewOpen] = useState(false);
  const [kbForm, setKbForm] = useState({ name: "", description: "", minRole: "viewer" });
  const [question, setQuestion] = useState("");
  const [model, setModel] = useState(defaultModel(options.models));
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<{ answer?: string; grounded?: boolean; results: { title: string; page: number | null; similarity: number | null; keywordRank: number | null; excerpt: string }[]; injectionFlags: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const kb = kbs.find((k) => k.id === activeKb);
  const docs = activeKb ? docsByKb[activeKb] ?? [] : [];

  async function upload(files: FileList | null) {
    if (!files?.length || !activeKb) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("minRole", minRole);
      try {
        const r = await api.post<{ status: string; chunks?: number; embedded?: boolean; error?: string }>(`/api/w/${slug}/knowledge/${activeKb}/documents`, fd);
        if (r.status === "failed") toast.error(`${file.name}: ${r.error}`);
        else if (r.status === "uploaded") toast.success(`${file.name} wordt op de achtergrond verwerkt`);
        else toast.success(`${file.name}: ${r.chunks} fragmenten${r.embedded ? " met embeddings" : " (trefwoordzoeken)"}`);
      } catch (e) {
        toast.error(`${file.name}: ${err(e)}`);
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  async function createKb(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await api.post<{ id: string }>(`/api/w/${slug}/knowledge`, kbForm);
      setNewOpen(false);
      setActiveKb(r.id);
      router.refresh();
    } catch (e2) {
      toast.error(err(e2));
    }
  }

  async function ask(searchOnly: boolean) {
    if (!question.trim()) return;
    setAsking(true);
    try {
      const { provider, modelId } = parseModelValue(model);
      const r = await api.post<typeof answer>(`/api/w/${slug}/knowledge/ask`, { question, knowledgeBaseIds: activeKb ? [activeKb] : [], searchOnly, provider, modelId });
      setAnswer(r);
    } catch (e) {
      toast.error(err(e));
    } finally {
      setAsking(false);
    }
  }

  async function docAction(id: string, action: "delete" | "reprocess" | "role", role?: string) {
    try {
      if (action === "delete") {
        if (!confirm("Document en alle fragmenten verwijderen?")) return;
        await api.del(`/api/w/${slug}/documents/${id}`);
      } else if (action === "reprocess") {
        await api.post(`/api/w/${slug}/documents/${id}`);
        toast.success("Opnieuw verwerkt");
      } else {
        await api.patch(`/api/w/${slug}/documents/${id}`, { minRole: role });
        toast.success("Toegangsrecht bijgewerkt");
      }
      router.refresh();
    } catch (e) {
      toast.error(err(e));
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
      <Card className="h-fit">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Kennisbanken</CardTitle>
          {canManage && <Button size="icon" variant="ghost" onClick={() => setNewOpen(true)} aria-label="Nieuwe kennisbank"><Plus /></Button>}
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {kbs.map((k) => (
            <button key={k.id} onClick={() => { setActiveKb(k.id); setAnswer(null); }} className={cn("rounded-xl px-3 py-2 text-left hover:bg-muted", k.id === activeKb && "bg-accent")}>
              <p className="text-sm font-semibold">{k.name}</p>
              <p className="text-xs text-muted-foreground">{k.documents} documenten · {k.chunks} fragmenten</p>
            </button>
          ))}
        </CardContent>
      </Card>

      {!kb ? (
        <EmptyState icon={<Library />} title="Geen kennisbank" description="Maak een kennisbank aan om documenten te uploaden." />
      ) : (
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{kb.name}</CardTitle>
              <CardDescription>
                {kb.description || "Geen omschrijving"} · Embeddings: {kb.embedding_model ?? "nog niet (trefwoordzoeken actief)"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {canManage && (
                <div
                  className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border p-6 text-center transition hover:border-brand-sky/60"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files); }}
                >
                  <Upload className="size-7 text-brand-sky" />
                  <div>
                    <p className="font-semibold">Sleep bestanden hierheen of kies ze</p>
                    <p className="text-xs text-muted-foreground">PDF, DOCX, TXT, MD, CSV, JSON, HTML · inhoud wordt gecontroleerd · dubbele documenten worden herkend</p>
                  </div>
                  <div className="flex flex-col items-center gap-2 sm:flex-row">
                    <Select value={minRole} onChange={(e) => setMinRole(e.target.value)} className="h-9 w-48" aria-label="Toegangsrecht">
                      {ROLES.map(([v, l]) => <option key={v} value={v}>Leesbaar voor: {l}</option>)}
                    </Select>
                    <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.xlsx,.txt,.md,.csv,.json,.html" className="hidden" onChange={(e) => upload(e.target.files)} data-testid="file-input" />
                    <Button onClick={() => fileRef.current?.click()} loading={uploading}><Upload /> Bestanden kiezen</Button>
                  </div>
                </div>
              )}
              {docs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nog geen documenten in deze kennisbank.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {docs.map((d) => (
                    <li key={d.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                      <FileText className="hidden size-5 shrink-0 text-muted-foreground sm:block" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{d.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {d.filename} · {formatNumber(Math.round(d.size_bytes / 1024))} KB · {d.chunk_count} fragmenten{d.has_embeddings ? " · embeddings" : ""} · {timeAgo(d.created_at)}
                        </p>
                        {d.error && <p className="text-xs text-warning">{d.error}</p>}
                      </div>
                      <StatusBadge status={d.status} />
                      {canManage && (
                        <div className="flex items-center gap-1">
                          <Select value={d.min_role} onChange={(e) => docAction(d.id, "role", e.target.value)} className="h-8 w-36 text-xs" aria-label="Toegangsrecht document">
                            {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </Select>
                          <Button size="icon" variant="ghost" onClick={() => docAction(d.id, "reprocess")} aria-label="Opnieuw verwerken"><RefreshCw /></Button>
                          <Button size="icon" variant="ghost" onClick={() => docAction(d.id, "delete")} aria-label="Verwijderen"><Trash2 /></Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Search className="size-4 text-turq-500" /> Zoeken en vragen stellen</CardTitle>
              <CardDescription>Hybride zoeken (pgvector + full-text). Antwoorden gebruiken alleen gevonden bronnen; ontbreekt informatie, dan wordt dat expliciet gemeld.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Textarea rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Bijv. Hoe snel worden klachten opgevolgd?" aria-label="Vraag" />
              <div className="flex flex-col gap-2 sm:flex-row">
                <ModelSelect models={options.models} value={model} onChange={setModel} className="sm:max-w-xs" />
                <Button variant="secondary" onClick={() => ask(true)} loading={asking}><Search /> Alleen zoeken</Button>
                <Button variant="accent" onClick={() => ask(false)} loading={asking}><BookOpen /> Vraag beantwoorden</Button>
              </div>
              {answer && (
                <div className="flex flex-col gap-3">
                  {answer.injectionFlags.length > 0 && <Alert tone="warning" title="Mogelijke prompt-injectie in bronnen">{answer.injectionFlags.join(", ")} — deze inhoud wordt als data behandeld.</Alert>}
                  {answer.answer && (
                    <div className={cn("rounded-2xl border p-4", answer.grounded ? "border-turq-400/40" : "border-warning/40 bg-warning/5")}>
                      <Markdown text={answer.answer} />
                    </div>
                  )}
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{answer.results.length} bronfragment{answer.results.length === 1 ? "" : "en"}</p>
                  {answer.results.map((r, i) => (
                    <div key={i} className="rounded-xl border border-border p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="turq">Bron {i + 1}</Badge>
                        <span className="font-medium">{r.title}{r.page ? `, p. ${r.page}` : ""}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {r.similarity !== null ? `vector ${r.similarity.toFixed(2)}` : ""}{r.keywordRank !== null ? ` · trefwoord ${r.keywordRank.toFixed(2)}` : ""}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-4 text-muted-foreground">{r.excerpt}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent title="Nieuwe kennisbank" description="Per organisatie of per agent. Toegang kan per kennisbank en per document worden beperkt.">
          <form onSubmit={createKb} className="flex flex-col gap-3">
            <Field label="Naam"><Input required minLength={2} value={kbForm.name} onChange={(e) => setKbForm({ ...kbForm, name: e.target.value })} /></Field>
            <Field label="Omschrijving"><Textarea rows={3} value={kbForm.description} onChange={(e) => setKbForm({ ...kbForm, description: e.target.value })} /></Field>
            <Field label="Zichtbaar voor">
              <Select value={kbForm.minRole} onChange={(e) => setKbForm({ ...kbForm, minRole: e.target.value })}>
                {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            <Button type="submit">Aanmaken</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
