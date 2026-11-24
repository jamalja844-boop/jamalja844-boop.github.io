"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Check, Code2, Copy, Download, FileSpreadsheet, FileText, FolderGit2, Info, KeyRound, Mail, MessageCircle, PanelRight, Paperclip, Plus, Save,
  Search, Send, Sparkles, Square, Trash2, User, Wand2, X,
} from "lucide-react";
import { commandSuggestions, SLASH_COMMANDS, type ChatArtifact, type DocumentKind, type SlashCommandDef } from "@workstudio/shared";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert, Badge, Kbd } from "@/components/ui/misc";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { Markdown } from "@/components/chat/markdown";
import type { UiMessage } from "@/components/chat/message-list";
import { ModelSelect, defaultModel, modelValue, parseModelValue } from "@/components/shared/model-select";
import { CodeTaskPanel } from "@/components/code/task-view";
import { api, ClientApiError, readNdjson } from "@/lib/client/api";
import type { StudioOptions } from "@/lib/studio-options";
import { cn, formatNumber, formatUsd, timeAgo } from "@/lib/utils";

interface ConvSummary {
  id: string;
  title: string;
  provider: string;
  model_id: string;
  style_id: string | null;
  project_id: string | null;
  project_name: string | null;
  pinned: boolean;
  updated_at: string;
}

interface AttachmentChip {
  id: string;
  filename: string;
  file_type: string;
  size_bytes: number;
  pages?: number | null;
  injection_flags?: string[];
}

const ATTACHMENT_ACCEPT = ".pdf,.docx,.xlsx,.csv,.txt,.md,.json,.html";
const formatBytes = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export interface StyleOption {
  id: string;
  name: string;
  description: string;
  instructions: string;
  is_default: boolean;
}

export interface ProjectOption {
  id: string;
  name: string;
  status: string;
}

const KIND_FOR_COMMAND: Record<string, DocumentKind> = {
  email: "email", reply: "reply", translate: "translation", summarize: "summary", analyze: "analysis", rewrite: "document", humanize: "document", create: "document",
};

const COMMAND_ICON: Record<SlashCommandDef["category"], React.ComponentType<{ className?: string }>> = { schrijven: Wand2, analyse: Sparkles, werk: Code2 };

const STARTERS = [
  { label: "E-mail aan klant", text: "/email aan een nieuwe zakelijke klant met een bevestiging van de intake voor kantoorschoonmaak, start volgende maand" },
  { label: "Antwoord op klacht", text: "/reply " },
  { label: "Tekst natuurlijk maken", text: "/humanize " },
  { label: "Vertaal naar Engels", text: "/translate engels " },
];

function copy(text: string) {
  navigator.clipboard.writeText(text).then(() => toast.success("Gekopieerd"), () => toast.error("Kopiëren lukt niet in deze browser"));
}

export function ChatWorkspace({
  slug, options, styles, projects, initialConversations, canCode, defaultStyleId,
}: {
  slug: string;
  options: StudioOptions;
  styles: StyleOption[];
  projects: ProjectOption[];
  initialConversations: ConvSummary[];
  canCode: boolean;
  defaultStyleId: string | null;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const base = `/api/w/${slug}`;
  const [conversations, setConversations] = useState(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(search.get("c"));
  const [model, setModel] = useState(defaultModel(options.models));
  const [styleId, setStyleId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(search.get("project"));
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; setup?: { provider: string; where: string } | null } | null>(null);
  const [filter, setFilter] = useState("");
  const [panel, setPanel] = useState(true);
  const [suggestIdx, setSuggestIdx] = useState(0);
  const [saveTarget, setSaveTarget] = useState<{ title: string; kind: DocumentKind; content: string; messageId: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  /** Gesprek dat net in send() is aangemaakt: niet opnieuw laden (zou het binnenkomende antwoord overschrijven). */
  const createdRef = useRef<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<AttachmentChip[]>([]);
  const [convFiles, setConvFiles] = useState<AttachmentChip[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const active = conversations.find((c) => c.id === activeId) ?? null;
  const defaultStyle = styles.find((s) => s.id === defaultStyleId) ?? styles.find((s) => s.is_default) ?? null;
  /** Zonder expliciete keuze geldt de persoonlijke voorkeur of de standaardstijl van de organisatie (zelfde logica als de server). */
  const style = styles.find((s) => s.id === styleId) ?? defaultStyle;
  const suggestions = useMemo(() => (/^\/[a-z]*$/i.test(input) ? commandSuggestions(input) : []), [input]);
  const isDemo = parseModelValue(model).provider === "demo";
  const noRealProvider = !options.providers.some((p) => p.configured && p.provider !== "demo");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);
  useEffect(() => setSuggestIdx(0), [suggestions.length]);

  const refreshList = useCallback(async () => {
    const r = await api.get<{ conversations: ConvSummary[] }>(`${base}/chat/conversations`);
    setConversations(r.conversations);
  }, [base]);

  const loadConversation = useCallback(async (id: string) => {
    try {
      const r = await api.get<{ conversation: ConvSummary; messages: UiMessage[]; attachments: AttachmentChip[] }>(`${base}/chat/conversations/${id}`);
      setConvFiles(r.attachments);
      setModel(modelValue(r.conversation.provider, r.conversation.model_id));
      setStyleId(r.conversation.style_id);
      setProjectId(r.conversation.project_id);
      setMessages(r.messages.filter((m) => m.role === "user" || m.role === "assistant"));
      setError(null);
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Gesprek laden mislukt");
      setActiveId(null);
    }
  }, [base]);

  useEffect(() => {
    if (activeId && activeId !== createdRef.current) loadConversation(activeId);
  }, [activeId, loadConversation]);

  function selectConversation(id: string | null) {
    abortRef.current?.abort();
    setActiveId(id);
    setMessages([]);
    setError(null);
    setPendingFiles([]);
    setConvFiles([]);
    router.replace(id ? `/w/${slug}/chat?c=${id}` : `/w/${slug}/chat`, { scroll: false });
    if (!id) setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function patchConversation(body: Record<string, unknown>) {
    if (!activeId) return;
    try {
      await api.patch(`${base}/chat/conversations/${activeId}`, body);
      refreshList().catch(() => {});
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Opslaan mislukt");
    }
  }

  function handleEvent(e: Record<string, unknown>) {
    switch (e.type) {
      case "user_message":
        setMessages((ms) => [...ms.filter((m) => m.id !== "pending-user"), e.message as UiMessage]);
        break;
      case "text":
        setMessages((ms) => {
          const last = ms[ms.length - 1];
          if (last?.id === "streaming") return [...ms.slice(0, -1), { ...last, content: last.content + (e.delta as string) }];
          return [...ms, { id: "streaming", role: "assistant", content: e.delta as string, streaming: true, provider: parseModelValue(model).provider }];
        });
        break;
      case "assistant_message":
        setMessages((ms) => [...ms.filter((m) => m.id !== "streaming"), e.message as UiMessage]);
        break;
      case "error":
        setMessages((ms) => ms.filter((m) => m.id !== "streaming"));
        setError({ message: e.error as string, setup: (e.setup as { provider: string; where: string }) ?? null });
        break;
    }
  }

  async function upload(list: FileList | File[] | null) {
    const filesToSend = Array.from(list ?? []);
    if (!filesToSend.length) return;
    setUploading(true);
    try {
      for (const f of filesToSend.slice(0, 10)) {
        const form = new FormData();
        form.append("file", f);
        if (activeId) form.append("conversationId", activeId);
        try {
          const r = await api.post<{ attachment: AttachmentChip }>(`${base}/chat/attachments`, form);
          setPendingFiles((p) => [...p, r.attachment]);
          if (r.attachment.injection_flags?.length) toast.warning(`${f.name}: bevat tekst die op instructies lijkt. Die wordt alleen als inhoud behandeld.`);
        } catch (e) {
          toast.error(`${f.name}: ${e instanceof ClientApiError ? e.message : "upload mislukt"}`);
        }
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeAttachment(id: string) {
    try {
      await api.del(`${base}/chat/attachments/${id}`);
      setPendingFiles((p) => p.filter((x) => x.id !== id));
      setConvFiles((p) => p.filter((x) => x.id !== id));
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Verwijderen mislukt");
    }
  }

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    if (!model) {
      setError({ message: "Er is nog geen AI-model beschikbaar. Koppel een AI-provider.", setup: { provider: "anthropic", where: "settings/providers" } });
      return;
    }
    let id = activeId;
    if (!id) {
      try {
        const { provider, modelId } = parseModelValue(model);
        const r = await api.post<{ conversation: ConvSummary }>(`${base}/chat/conversations`, { provider, modelId, styleId, projectId });
        id = r.conversation.id;
        createdRef.current = id;
        setActiveId(id);
        router.replace(`/w/${slug}/chat?c=${id}`, { scroll: false });
      } catch (err) {
        const ce = err instanceof ClientApiError ? err : null;
        setError({ message: ce?.message ?? "Gesprek starten mislukt", setup: ce?.setup });
        return;
      }
    }
    const sending = pendingFiles;
    setInput("");
    setPendingFiles([]);
    setConvFiles((c) => [...c, ...sending.filter((f) => !c.some((x) => x.id === f.id))]);
    setMessages((ms) => [...ms, { id: "pending-user", role: "user", content, metadata: sending.length ? { attachments: sending.map((f) => f.filename) } : {} }]);
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${base}/chat/conversations/${id}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content, attachmentIds: sending.map((f) => f.id) }), signal: controller.signal,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new ClientApiError(res.status, d.error ?? `Fout ${res.status}`, d.details);
      }
      await readNdjson(res, handleEvent);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        const ce = err instanceof ClientApiError ? err : null;
        setMessages((ms) => ms.filter((m) => m.id !== "pending-user"));
        setError({ message: ce?.message ?? "Verbinding verbroken", setup: ce?.setup });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
      setMessages((ms) => ms.map((m) => (m.id === "streaming" ? { ...m, streaming: false } : m)));
      refreshList().catch(() => {});
    }
  }

  async function remove(id: string) {
    if (!confirm("Dit gesprek definitief verwijderen?")) return;
    try {
      await api.del(`${base}/chat/conversations/${id}`);
      if (id === activeId) selectConversation(null);
      await refreshList();
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Verwijderen mislukt");
    }
  }

  function pickSuggestion(c: SlashCommandDef) {
    setInput(`/${c.name} ${c.name === "translate" ? "engels " : ""}`);
    inputRef.current?.focus();
  }

  function openSave(m: UiMessage) {
    const art = m.metadata?.artifact as ChatArtifact | undefined;
    const command = (m.metadata?.command as string | undefined) ?? "";
    if (art?.type === "email") {
      setSaveTarget({ title: art.subject, kind: command === "reply" ? "reply" : "email", content: `Onderwerp: ${art.subject}\n\n${art.body}`, messageId: m.id });
    } else {
      const firstLine = m.content.replace(/^\s*\[DEMO[^\]]*\]\s*/i, "").split("\n").find((l) => l.trim()) ?? "AI-tekst";
      setSaveTarget({ title: firstLine.replace(/^#+\s*/, "").replace(/[*_`]/g, "").slice(0, 80), kind: KIND_FOR_COMMAND[command] ?? "other", content: m.content, messageId: m.id });
    }
  }

  const filtered = conversations.filter((c) => !filter || c.title.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className={cn("grid h-[calc(100dvh-7.5rem)] min-h-[560px] grid-cols-1 gap-4 lg:h-[calc(100dvh-4rem)] lg:grid-cols-[260px_1fr]", panel && "xl:grid-cols-[260px_1fr_300px]")}>
      {/* Links: gesprekken en projecten */}
      <aside className="hidden min-h-0 flex-col rounded-2xl border border-border bg-card lg:flex" aria-label="Gesprekken en projecten">
        <div className="grid gap-2 p-3">
          <Button className="w-full" variant="accent" onClick={() => selectConversation(null)} data-testid="new-chat"><Plus /> Nieuwe chat</Button>
          <label className="relative block">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Zoek in gesprekken" aria-label="Zoek in gesprekken"
              className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-2 text-[13px] outline-none focus:ring-2 focus:ring-ring/40" />
          </label>
        </div>
        <p className="px-4 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Gesprekken</p>
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {filtered.length === 0 && <li className="px-2 py-6 text-center text-xs text-muted-foreground">{filter ? "Geen resultaten" : "Nog geen gesprekken"}</li>}
          {filtered.map((c) => (
            <li key={c.id} className="group relative">
              <button onClick={() => selectConversation(c.id)} className={cn("w-full rounded-xl px-3 py-2 text-left transition-colors hover:bg-muted", c.id === activeId && "bg-accent")}>
                <span className="block truncate pr-6 text-[13px] font-medium">{c.title}</span>
                <span className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                  {c.project_name && <><FolderGit2 className="size-3" /> {c.project_name} ·</>} {timeAgo(c.updated_at)}
                </span>
              </button>
              <button onClick={() => remove(c.id)} aria-label={`Verwijder ${c.title}`} className="absolute right-2 top-2.5 hidden rounded p-1 text-muted-foreground hover:text-danger group-hover:block">
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
        {canCode && (
          <div className="border-t border-border p-2">
            <div className="flex items-center justify-between px-2 pb-1 pt-1">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Projecten</p>
              <Link href={`/w/${slug}/code`} className="text-[11px] font-semibold text-brand-sky-strong hover:underline dark:text-brand-sky">Alles</Link>
            </div>
            <ul className="max-h-40 overflow-y-auto">
              {projects.length === 0 && <li className="px-2 py-2 text-xs text-muted-foreground">Nog geen projecten. <Link className="underline" href={`/w/${slug}/code`}>Maak er een</Link>.</li>}
              {projects.map((p) => (
                <li key={p.id}>
                  <Link href={`/w/${slug}/code/${p.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-muted">
                    <FolderGit2 className="size-3.5 text-brand-sky-strong dark:text-brand-sky" /> <span className="truncate">{p.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>

      {/* Midden: chat */}
      <section
        className={cn("relative flex min-h-0 min-w-0 flex-col rounded-2xl border border-border bg-card", dragOver && "ring-2 ring-brand-sky")}
        aria-label="AI Chat"
        onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragOver(true); } }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
        onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); setDragOver(false); upload(e.dataTransfer.files); } }}
      >
        {dragOver && (
          <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center rounded-2xl bg-navy-950/60 text-sm font-semibold text-white backdrop-blur-sm">
            Laat los om toe te voegen (PDF, Word, Excel, CSV, tekst)
          </div>
        )}
        <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-semibold">{active?.title ?? "Nieuwe chat"}</h1>
            <p className="truncate text-xs text-muted-foreground">{style ? `Stijl: ${style.name}${styleId ? "" : " (standaard)"}` : "Geen schrijfstijl ingesteld"}{active?.project_name ? ` · Project: ${active.project_name}` : ""}</p>
          </div>
          {isDemo && <Badge tone="demo" title="Antwoorden komen van de demo-simulator, niet van een echte AI">DEMO</Badge>}
          {activeId && (
            <Button asChild variant="ghost" size="icon" aria-label="Exporteren als Markdown" title="Exporteren als Markdown">
              <a href={`${base}/chat/conversations/${activeId}/export`}><Download /></a>
            </Button>
          )}
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => selectConversation(null)} aria-label="Nieuwe chat"><Plus /></Button>
          <Button variant="ghost" size="icon" className="hidden xl:inline-flex" onClick={() => setPanel(!panel)} aria-label="Zijpaneel tonen of verbergen"><PanelRight /></Button>
        </header>

        <div className="grid gap-2 border-b border-border px-4 py-2.5 sm:grid-cols-3">
          <ModelSelect models={options.models} value={model} className="h-9 text-[13px]" onChange={(v) => {
            setModel(v);
            const { provider, modelId } = parseModelValue(v);
            patchConversation({ provider, modelId });
          }} />
          <Select aria-label="Schrijfstijl" className="h-9 text-[13px]" value={styleId ?? ""} onChange={(e) => {
            const v = e.target.value || null;
            setStyleId(v);
            patchConversation({ styleId: v });
          }}>
            <option value="">{defaultStyle ? `Standaard: ${defaultStyle.name}` : "Standaardstijl"}</option>
            {styles.map((s) => <option key={s.id} value={s.id}>{s.name}{s.is_default ? " (standaard)" : ""}</option>)}
          </Select>
          <Select aria-label="Project" className="h-9 text-[13px]" value={projectId ?? ""} disabled={!canCode} onChange={(e) => {
            const v = e.target.value || null;
            setProjectId(v);
            patchConversation({ projectId: v });
          }}>
            <option value="">{canCode ? "Geen project gekoppeld" : "AI Code: geen toegang"}</option>
            {projects.filter((p) => p.status === "ready").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6" data-testid="chat-messages">
          {noRealProvider && (
            <div className="mb-4">
              <Alert tone="warning" title="Nog geen echte AI-provider gekoppeld" action={<Button asChild size="sm"><Link href={`/w/${slug}/settings?tab=providers`}><KeyRound /> Koppelen</Link></Button>}>
                {options.models.some((m) => m.provider === "demo" && m.available)
                  ? "Je werkt nu met de demo-simulator: antwoorden zijn gesimuleerd en duidelijk gemarkeerd. Koppel Anthropic of OpenAI voor echte teksten."
                  : "Koppel Anthropic of OpenAI onder Instellingen om AI Chat te gebruiken."}
              </Alert>
            </div>
          )}
          {messages.length === 0 ? (
            <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 py-10 text-center">
              <span className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-sky/25 to-turq-400/25 text-brand-sky-strong dark:text-brand-sky">
                <MessageCircle className="size-7" />
              </span>
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Waar kan ik je mee helpen?</h2>
                <p className="mt-1 text-sm text-muted-foreground">Typ een vraag, of begin met <Kbd>/</Kbd> voor een opdracht zoals e-mail, vertalen of een AI Code-taak.</p>
              </div>
              <div className="grid w-full gap-2 sm:grid-cols-2">
                {STARTERS.map((s) => (
                  <button key={s.label} onClick={() => { setInput(s.text); inputRef.current?.focus(); }}
                    className="rounded-xl border border-border bg-background px-4 py-3 text-left text-sm transition hover:border-brand-sky/50 hover:bg-muted">
                    <span className="font-medium">{s.label}</span>
                    <span className="mt-0.5 block truncate font-mono text-[11.5px] text-muted-foreground">{s.text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ol className="mx-auto flex max-w-3xl flex-col gap-6">
              {messages.map((m) => (
                <ChatMessageItem key={m.id} m={m} slug={slug} conversationId={activeId} onSave={() => openSave(m)} />
              ))}
            </ol>
          )}
          {error && (
            <div className="mx-auto mt-4 max-w-3xl">
              <Alert tone="danger" title={error.setup ? "Verbinding nog niet ingesteld" : "Er ging iets mis"}
                action={error.setup ? <Button asChild size="sm"><Link href={`/w/${slug}/settings?tab=providers`}><KeyRound /> Instellen</Link></Button> : undefined}>
                {error.message}
              </Alert>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="relative border-t border-border p-3">
          {suggestions.length > 0 && (
            <ul role="listbox" aria-label="Opdrachten" data-testid="command-suggestions"
              className="absolute bottom-full left-3 right-3 mb-2 max-h-72 overflow-y-auto rounded-2xl border border-border bg-card p-1.5 shadow-xl">
              {suggestions.map((c, i) => {
                const Icon = COMMAND_ICON[c.category];
                return (
                  <li key={c.name} role="option" aria-selected={i === suggestIdx}>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); pickSuggestion(c); }}
                      className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left", i === suggestIdx ? "bg-accent" : "hover:bg-muted")}>
                      <Icon className="size-4 text-brand-sky-strong dark:text-brand-sky" />
                      <span className="font-mono text-[13px] font-semibold">/{c.name}</span>
                      <span className="text-[13px] text-muted-foreground">{c.description}</span>
                      {c.argHint && <span className="ml-auto text-[11px] text-muted-foreground">{c.argHint}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {(pendingFiles.length > 0 || uploading) && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5" data-testid="pending-attachments">
              {pendingFiles.map((f) => (
                <span key={f.id} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/60 py-1 pl-2 pr-1 text-xs">
                  {f.file_type === "xlsx" || f.file_type === "csv" ? <FileSpreadsheet className="size-3.5 text-turq-600" /> : <FileText className="size-3.5 text-brand-sky-strong" />}
                  <span className="max-w-[180px] truncate font-medium">{f.filename}</span>
                  <span className="text-muted-foreground">{formatBytes(f.size_bytes)}</span>
                  <button type="button" onClick={() => removeAttachment(f.id)} className="rounded p-0.5 hover:bg-background" aria-label={`Verwijder ${f.filename}`}><X className="size-3" /></button>
                </span>
              ))}
              {uploading && <span className="text-xs text-muted-foreground">Bestand lezen…</span>}
              {pendingFiles.length > 0 && !input.trim() && (
                <span className="ml-auto flex gap-1">
                  {(["summarize", "analyze", "excel"] as const).map((c) => (
                    <Button key={c} type="button" size="sm" variant="secondary" className="h-7" onClick={() => send(`/${c}`)} disabled={busy}>
                      {{ summarize: "Samenvatten", analyze: "Analyseren", excel: "Naar Excel" }[c]}
                    </Button>
                  ))}
                </span>
              )}
            </div>
          )}
          <div className="flex items-end gap-2 rounded-2xl border border-input bg-background p-2 focus-within:ring-2 focus-within:ring-ring/50">
            <input ref={fileRef} type="file" multiple accept={ATTACHMENT_ACCEPT} className="hidden" onChange={(e) => upload(e.target.files)} data-testid="attach-input" />
            <Button type="button" size="icon" variant="ghost" onClick={() => fileRef.current?.click()} aria-label="Bestand toevoegen" title="Bestand toevoegen (PDF, Word, Excel, CSV, tekst)" disabled={uploading}>
              <Paperclip />
            </Button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (suggestions.length) {
                  if (e.key === "ArrowDown") { e.preventDefault(); setSuggestIdx((i) => (i + 1) % suggestions.length); return; }
                  if (e.key === "ArrowUp") { e.preventDefault(); setSuggestIdx((i) => (i - 1 + suggestions.length) % suggestions.length); return; }
                  if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) { e.preventDefault(); pickSuggestion(suggestions[suggestIdx]); return; }
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={Math.min(8, Math.max(1, input.split("\n").length))}
              placeholder="Bericht aan AI WorkStudio… (/ voor opdrachten, Shift+Enter voor nieuwe regel)"
              aria-label="Bericht"
              className="max-h-56 flex-1 resize-none bg-transparent px-2 py-1.5 text-[14.5px] outline-none"
            />
            {busy ? (
              <Button type="button" size="icon" variant="secondary" onClick={() => abortRef.current?.abort()} aria-label="Stoppen"><Square /></Button>
            ) : (
              <Button type="submit" size="icon" variant="accent" disabled={!input.trim()} aria-label="Versturen"><Send /></Button>
            )}
          </div>
        </form>
      </section>

      {/* Rechts: context en opdrachten */}
      {panel && (
        <aside className="hidden min-h-0 flex-col gap-4 overflow-y-auto rounded-2xl border border-border bg-card p-4 xl:flex" aria-label="Context">
          <div>
            <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Schrijfstijl</p>
            {style ? (
              <div className="rounded-xl border border-border bg-muted/40 p-3">
                <p className="text-sm font-semibold">{style.name}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{style.description || style.instructions.slice(0, 220)}</p>
              </div>
            ) : <p className="text-xs text-muted-foreground">Nog geen schrijfstijl ingesteld.</p>}
            <Link href={`/w/${slug}/writing?tab=styles`} className="mt-2 inline-block text-xs font-semibold text-brand-sky-strong hover:underline dark:text-brand-sky">Stijlen en persoonlijke instructies</Link>
          </div>
          <div>
            <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Bestanden in dit gesprek</p>
            {convFiles.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sleep een bestand in de chat of gebruik de paperclip. Alleen de tekst wordt bewaard, privé voor jou.</p>
            ) : (
              <ul className="grid gap-1" data-testid="conversation-files">
                {convFiles.map((f) => (
                  <li key={f.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-muted">
                    {f.file_type === "xlsx" || f.file_type === "csv" ? <FileSpreadsheet className="size-3.5 shrink-0 text-turq-600" /> : <FileText className="size-3.5 shrink-0 text-brand-sky-strong" />}
                    <span className="min-w-0 flex-1 truncate">{f.filename}</span>
                    <button onClick={() => removeAttachment(f.id)} className="hidden text-muted-foreground hover:text-danger group-hover:block" aria-label={`Verwijder ${f.filename}`}><Trash2 className="size-3.5" /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Opdrachten</p>
            <ul className="grid gap-1">
              {SLASH_COMMANDS.map((c) => (
                <li key={c.name}>
                  <button onClick={() => pickSuggestion(c)} className="flex w-full items-baseline gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted">
                    <span className="font-mono text-[12.5px] font-semibold">/{c.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{c.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-brand-sky/30 bg-brand-sky/8 p-3 text-xs leading-relaxed">
            <p className="flex items-center gap-1.5 font-semibold"><Info className="size-3.5" /> Veilig werken</p>
            <p className="mt-1 text-muted-foreground">AI Chat verstuurt nooit zelf e-mails of berichten. Teksten sla je op als concept; externe verzending vraagt altijd jouw goedkeuring.</p>
          </div>
        </aside>
      )}

      <SaveDialog slug={slug} target={saveTarget} conversationId={activeId} onClose={() => setSaveTarget(null)} />
    </div>
  );
}

function ChatMessageItem({ m, slug, conversationId, onSave }: { m: UiMessage; slug: string; conversationId: string | null; onSave: () => void }) {
  const [copied, setCopied] = useState(false);
  const art = m.metadata?.artifact as ChatArtifact | undefined;
  const command = m.metadata?.command as string | undefined;
  if (m.role === "user") {
    return (
      <li className="flex justify-end gap-3" data-testid="msg-user">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-md bg-navy-900 px-4 py-2.5 text-[14.5px] text-white dark:bg-navy-700">
          {command && <span className="mr-1.5 rounded-md bg-white/15 px-1.5 py-0.5 font-mono text-[12px]">/{command}</span>}
          {command ? m.content.replace(/^\s*\/[a-z]+\s*/i, "") : m.content}
          {Array.isArray(m.metadata?.attachments) && (m.metadata.attachments as string[]).length > 0 && (
            <span className="mt-1.5 flex flex-wrap gap-1">
              {(m.metadata.attachments as string[]).map((f) => <span key={f} className="inline-flex items-center gap-1 rounded-md bg-white/15 px-1.5 py-0.5 text-[11.5px]"><Paperclip className="size-3" />{f}</span>)}
            </span>
          )}
        </div>
        <span className="mt-1 grid size-7 shrink-0 place-items-center rounded-full bg-muted"><User className="size-3.5" /></span>
      </li>
    );
  }
  const doCopy = () => {
    copy(art?.type === "email" ? `Onderwerp: ${art.subject}\n\n${art.body}` : m.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const showText = !art || art.type === "text" || art.type === "document" || art.type === "file";
  const exportBase = conversationId && !m.id.startsWith("streaming") ? `/api/w/${slug}/chat/conversations/${conversationId}/messages/${m.id}/export` : null;
  return (
    <li className="flex gap-3" data-testid="msg-assistant" data-command={command ?? ""}>
      <span className="mt-1 grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-sky to-turq-400 text-navy-950"><Sparkles className="size-3.5" /></span>
      <div className="min-w-0 flex-1">
        {art?.type === "email" && <EmailCard subject={art.subject} body={art.body} demo={Boolean(m.metadata?.demo)} />}
        {art?.type === "notice" && (
          <div className="rounded-2xl border border-warning/40 bg-warning/8 p-4" data-testid="notice-card">
            <p className="text-sm font-semibold">{art.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{m.content}</p>
            {art.missing.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-[13px] text-muted-foreground">{art.missing.map((x) => <li key={x}>{x}</li>)}</ul>
            )}
          </div>
        )}
        {art?.type === "code_task" && (
          <div className="rounded-2xl border border-border bg-muted/30 p-4" data-testid="code-task-card">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold"><Code2 className="size-4 text-brand-sky-strong dark:text-brand-sky" /> AI Code · {art.projectName}</p>
            <CodeTaskPanel slug={slug} taskId={art.taskId} compact />
          </div>
        )}
        {showText && (
          <div className={cn("prose-chat text-[14.5px] leading-relaxed", m.streaming && "after:ml-0.5 after:inline-block after:h-4 after:w-1.5 after:animate-pulse after:bg-brand-sky after:align-middle")}>
            <Markdown text={m.content} />
          </div>
        )}
        {art?.type === "document" && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-turq-400/40 bg-turq-400/8 px-3 py-2.5 text-sm" data-testid="document-card">
            <FileText className="size-4 text-turq-600 dark:text-turq-300" />
            <Link href={`/w/${slug}/writing?doc=${art.documentId}`} className="font-medium hover:underline">{art.title}</Link>
            <span className="ml-auto flex gap-1">
              <Button asChild size="sm" variant="secondary" className="h-7"><a href={`/api/w/${slug}/writing/documents/${art.documentId}/export?format=docx`}>Word</a></Button>
              <Button asChild size="sm" variant="secondary" className="h-7"><a href={`/api/w/${slug}/writing/documents/${art.documentId}/export?format=pdf`}>PDF</a></Button>
              <Button asChild size="sm" variant="ghost" className="h-7"><Link href={`/w/${slug}/writing?doc=${art.documentId}`}>Openen →</Link></Button>
            </span>
          </div>
        )}
        {art?.type === "file" && (
          <a href={`/api/w/${slug}/files/${art.fileId}`} className="mt-3 flex items-center gap-3 rounded-xl border border-turq-400/40 bg-turq-400/8 px-3 py-2.5 text-sm hover:bg-turq-400/12" data-testid="file-card">
            <FileSpreadsheet className="size-5 text-turq-600 dark:text-turq-300" />
            <span className="min-w-0">
              <span className="block truncate font-semibold">{art.filename}</span>
              <span className="block text-xs text-muted-foreground">{formatBytes(art.sizeBytes)}{art.sheets?.length ? ` · ${art.sheets.map((x) => `${x.name} (${x.rows} rijen)`).join(", ")}` : ""}</span>
            </span>
            <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-turq-600 dark:text-turq-300"><Download className="size-3.5" /> Downloaden</span>
          </a>
        )}
        {!m.streaming && art?.type !== "notice" && art?.type !== "code_task" && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <Button variant="ghost" size="sm" onClick={doCopy}>{copied ? <Check /> : <Copy />} Kopiëren</Button>
            {art?.type !== "document" && art?.type !== "file" && <Button variant="ghost" size="sm" onClick={onSave} data-testid="save-document"><Save /> Opslaan als document</Button>}
            {exportBase && art?.type !== "document" && art?.type !== "file" && (
              <>
                <Button asChild variant="ghost" size="sm"><a href={`${exportBase}?format=docx`} data-testid="export-docx"><Download /> Word</a></Button>
                <Button asChild variant="ghost" size="sm"><a href={`${exportBase}?format=pdf`}><Download /> PDF</a></Button>
              </>
            )}
            {typeof m.metadata?.styleName === "string" && <span className="ml-auto text-[11px] text-muted-foreground">Stijl: {m.metadata.styleName}</span>}
            {m.output_tokens ? <span className={cn("text-[11px] text-muted-foreground", typeof m.metadata?.styleName !== "string" && "ml-auto")}>· {formatNumber((m.input_tokens ?? 0) + m.output_tokens)} tokens · {formatUsd(m.cost_usd ?? null)}</span> : null}
          </div>
        )}
      </div>
    </li>
  );
}

function EmailCard({ subject, body, demo }: { subject: string; body: string; demo: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm" data-testid="email-card">
      <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-2.5">
        <Mail className="size-4 text-brand-sky-strong dark:text-brand-sky" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Onderwerp</span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold" data-testid="email-subject">{subject}</span>
        {demo && <Badge tone="demo">DEMO</Badge>}
      </div>
      <div className="whitespace-pre-wrap px-4 py-3 text-[14px] leading-relaxed">{body}</div>
      <div className="border-t border-border bg-muted/30 px-4 py-2 text-[11.5px] text-muted-foreground">
        Concept – wordt niet automatisch verstuurd. Verzenden via een gekoppeld e-mailaccount volgt in Integratiebeheer en vraagt altijd jouw bevestiging.
      </div>
    </div>
  );
}

function SaveDialog({ slug, target, conversationId, onClose }: { slug: string; target: { title: string; kind: DocumentKind; content: string; messageId: string } | null; conversationId: string | null; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  useEffect(() => {
    if (target) {
      setTitle(target.title);
      setShared(false);
    }
  }, [target]);
  async function save() {
    if (!target) return;
    setBusy(true);
    try {
      const r = await api.post<{ id: string }>(`/api/w/${slug}/writing/documents`, {
        title: title.trim() || "Naamloos document", kind: target.kind, content: target.content, metadata: { messageId: target.messageId }, conversationId, shared,
      });
      toast.success("Opgeslagen in de Schrijfstudio", { action: { label: "Openen", onClick: () => router.push(`/w/${slug}/writing?doc=${r.id}`) } });
      onClose();
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Opslaan mislukt");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={Boolean(target)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Opslaan als document" description="Het document komt als concept in de Schrijfstudio, met versiegeschiedenis.">
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <Field label="Titel" htmlFor="doc-title"><Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required /></Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-[#14b8a6]" checked={shared} onChange={(e) => setShared(e.target.checked)} /> Delen met collega&apos;s in deze workspace
          </label>
          <Button type="submit" variant="accent" loading={busy} data-testid="confirm-save"><Save /> Opslaan</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
