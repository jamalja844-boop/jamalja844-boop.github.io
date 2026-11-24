"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, MessagesSquare, Plus, Send, Settings2, Square, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Alert, Badge, EmptyState } from "@/components/ui/misc";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { MessageList, type PendingApproval, type UiMessage } from "@/components/chat/message-list";
import { ModelSelect, defaultModel, modelValue, parseModelValue } from "@/components/shared/model-select";
import { api, ClientApiError, readNdjson } from "@/lib/client/api";
import type { StudioOptions } from "@/lib/studio-options";
import { cn, formatNumber, formatUsd, timeAgo } from "@/lib/utils";

interface ConvSummary {
  id: string;
  title: string;
  provider: string;
  model_id: string;
  total_cost_usd: string;
  tokens: number;
  updated_at: string;
}

interface Settings {
  model: string;
  systemPrompt: string;
  toolKeys: string[];
  knowledgeBaseIds: string[];
  promptId: string | null;
}

const DEFAULT_SYSTEM = "Je bent een behulpzame, nauwkeurige zakelijke AI-assistent. Antwoord in het Nederlands, duidelijk en beknopt.";

export function ChatStudio({ slug, options, initialConversations, canDecide }: { slug: string; options: StudioOptions; initialConversations: ConvSummary[]; canDecide: boolean }) {
  const router = useRouter();
  const search = useSearchParams();
  const [conversations, setConversations] = useState(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(search.get("c"));
  const [settings, setSettings] = useState<Settings>({ model: defaultModel(options.models), systemPrompt: DEFAULT_SYSTEM, toolKeys: [], knowledgeBaseIds: [], promptId: null });
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [pending, setPending] = useState<PendingApproval[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; setup?: { provider: string; where: string } | null } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  /** Net aangemaakt gesprek niet opnieuw laden: dat zou het binnenkomende antwoord kunnen overschrijven. */
  const createdRef = useRef<string | null>(null);
  const base = `/api/w/${slug}`;

  const totals = useMemo(() => {
    const a = messages.filter((m) => m.role === "assistant" && !m.streaming);
    return {
      tokens: a.reduce((s, m) => s + (m.input_tokens ?? 0) + (m.output_tokens ?? 0), 0),
      cost: a.reduce<number | null>((s, m) => (s === null || m.cost_usd === null || m.cost_usd === undefined ? null : s + Number(m.cost_usd)), 0),
    };
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  const refreshList = useCallback(async () => {
    const r = await api.get<{ conversations: ConvSummary[] }>(`${base}/conversations`);
    setConversations(r.conversations);
  }, [base]);

  const loadConversation = useCallback(async (id: string) => {
    try {
      const r = await api.get<{
        conversation: { id: string; provider: string; model_id: string; system_prompt: string; tool_keys: string[]; knowledge_base_ids: string[]; prompt_id: string | null };
        messages: UiMessage[];
        pendingApprovals: { id: string; tool_call_id: string }[];
      }>(`${base}/conversations/${id}`);
      setSettings({
        model: modelValue(r.conversation.provider, r.conversation.model_id),
        systemPrompt: r.conversation.system_prompt,
        toolKeys: r.conversation.tool_keys,
        knowledgeBaseIds: r.conversation.knowledge_base_ids,
        promptId: r.conversation.prompt_id,
      });
      setMessages(r.messages);
      const calls = r.messages.flatMap((m) => m.tool_calls ?? []);
      setPending(r.pendingApprovals.map((p) => ({ id: p.id, toolKey: calls.find((c) => c.id === p.tool_call_id)?.name ?? "tool" })));
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
    setActiveId(id);
    setMessages([]);
    setPending([]);
    setError(null);
    if (!id) setSettings((s) => ({ ...s, promptId: null }));
    router.replace(id ? `/w/${slug}/llm?c=${id}` : `/w/${slug}/llm`, { scroll: false });
  }

  async function persistSettings(next: Partial<Settings>) {
    const merged = { ...settings, ...next };
    setSettings(merged);
    if (!activeId) return;
    try {
      const { provider, modelId } = parseModelValue(merged.model);
      await api.patch(`${base}/conversations/${activeId}`, {
        provider, modelId, systemPrompt: merged.systemPrompt, toolKeys: merged.toolKeys, knowledgeBaseIds: merged.knowledgeBaseIds, promptId: merged.promptId,
      });
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
          return [...ms, { id: "streaming", role: "assistant", content: e.delta as string, streaming: true, provider: parseModelValue(settings.model).provider }];
        });
        break;
      case "assistant_message":
        setMessages((ms) => [...ms.filter((m) => m.id !== "streaming"), e.message as UiMessage]);
        break;
      case "tool_result":
        setMessages((ms) => [...ms, e.message as UiMessage]);
        break;
      case "approval_required":
        setPending((p) => (p.some((x) => x.id === e.approvalId) ? p : [...p, { id: e.approvalId as string, toolKey: e.toolKey as string }]));
        break;
      case "error":
        setMessages((ms) => ms.filter((m) => m.id !== "streaming"));
        setError({ message: e.error as string, setup: (e.setup as { provider: string; where: string }) ?? null });
        break;
    }
  }

  async function stream(url: string, body: unknown) {
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new ClientApiError(res.status, d.error ?? `Fout ${res.status}`, d.details);
      }
      await readNdjson(res, handleEvent);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        const ce = err instanceof ClientApiError ? err : null;
        setError({ message: ce?.message ?? "Verbinding verbroken", setup: ce?.setup });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
      setMessages((ms) => ms.map((m) => (m.id === "streaming" ? { ...m, streaming: false } : m)));
      refreshList().catch(() => {});
    }
  }

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const content = input.trim();
    if (!content || busy) return;
    if (!settings.model) {
      setError({ message: "Kies eerst een AI-model.", setup: { provider: "anthropic", where: "settings/providers" } });
      return;
    }
    let id = activeId;
    if (!id) {
      try {
        const { provider, modelId } = parseModelValue(settings.model);
        const r = await api.post<{ conversation: { id: string } }>(`${base}/conversations`, {
          provider, modelId, systemPrompt: settings.systemPrompt, toolKeys: settings.toolKeys, knowledgeBaseIds: settings.knowledgeBaseIds, promptId: settings.promptId,
        });
        id = r.conversation.id;
        createdRef.current = id;
        setActiveId(id);
        router.replace(`/w/${slug}/llm?c=${id}`, { scroll: false });
      } catch (err) {
        setError({ message: err instanceof ClientApiError ? err.message : "Gesprek starten mislukt" });
        return;
      }
    }
    setInput("");
    setPending([]);
    setMessages((ms) => [...ms, { id: "pending-user", role: "user", content }]);
    await stream(`${base}/conversations/${id}/messages`, { content });
  }

  async function decide(approvalId: string, approve: boolean) {
    try {
      const r = await api.post<{ execution: { status: string; error: string | null } | null }>(`${base}/approvals/${approvalId}`, { decision: approve ? "approve" : "reject" });
      toast.success(approve ? (r.execution?.status === "succeeded" ? "Goedgekeurd en uitgevoerd" : `Goedgekeurd – ${r.execution?.error ?? r.execution?.status}`) : "Afgewezen");
      setPending((p) => p.filter((x) => x.id !== approvalId));
      if (activeId) await stream(`${base}/conversations/${activeId}/continue`, {});
    } catch (err) {
      toast.error(err instanceof ClientApiError ? err.message : "Besluit mislukt");
    }
  }

  async function saveResult(m: UiMessage) {
    try {
      const title = m.content.replace(/\[DEMO[^\]]*\]/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || "AI-resultaat";
      await api.post(`${base}/records`, {
        collection: "ai_resultaten",
        title,
        data: { inhoud: m.content, model: m.model_id, gesprek_id: activeId, bericht_id: m.id, bronnen: m.citations ?? [] },
      });
      toast.success("Resultaat opgeslagen in Bedrijfsgegevens → ai_resultaten");
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Opslaan mislukt");
    }
  }

  async function remove(id: string) {
    if (!confirm("Dit gesprek definitief verwijderen?")) return;
    await api.del(`${base}/conversations/${id}`);
    if (id === activeId) selectConversation(null);
    refreshList();
  }

  const prompt = options.prompts.find((p) => p.id === settings.promptId);
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const noRealProvider = !options.providers.some((p) => p.configured && p.provider !== "demo");

  const settingsPanel = (
    <div className="flex flex-col gap-4">
      <Field label="AI-model" htmlFor="model">
        <ModelSelect id="model" models={options.models} value={settings.model} onChange={(v) => persistSettings({ model: v })} />
      </Field>
      {noRealProvider && (
        <Link href={`/w/${slug}/settings?tab=providers`} className="flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/8 p-2.5 text-xs font-medium">
          <KeyRound className="size-3.5 text-warning" /> Stel Anthropic of OpenAI in voor echte antwoorden
        </Link>
      )}
      <Field label="Prompt-template" htmlFor="prompt" hint={prompt ? `Versie ${prompt.version}` : "Optioneel: vult de systeeminstructies"}>
        <select
          id="prompt"
          className="h-10 rounded-xl border border-input bg-card px-3 text-sm"
          value={settings.promptId ?? ""}
          onChange={(e) => {
            const p = options.prompts.find((x) => x.id === e.target.value);
            persistSettings({ promptId: p?.id ?? null, systemPrompt: p ? p.system : settings.systemPrompt });
          }}
        >
          <option value="">Geen</option>
          {options.prompts.map((p) => <option key={p.id} value={p.id}>{p.name} (v{p.version})</option>)}
        </select>
      </Field>
      {prompt?.user_template && (
        <Button variant="secondary" size="sm" onClick={() => setTemplateOpen(true)}>Gebruikersprompt invullen</Button>
      )}
      <Field label="Systeeminstructies" htmlFor="system">
        <Textarea id="system" rows={6} value={settings.systemPrompt} onChange={(e) => setSettings({ ...settings, systemPrompt: e.target.value })} onBlur={() => persistSettings({})} />
      </Field>
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tools</p>
        <div className="flex max-h-56 flex-col gap-1 overflow-y-auto pr-1">
          {options.tools.map((t) => (
            <label key={t.key} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
              <input type="checkbox" className="mt-0.5 accent-[#14b8a6]" checked={settings.toolKeys.includes(t.key)} onChange={() => persistSettings({ toolKeys: toggle(settings.toolKeys, t.key) })} />
              <span className="min-w-0">
                <span className="block font-medium leading-tight">{t.name}</span>
                <span className="font-mono text-[10.5px] text-muted-foreground">{t.key}{t.requires_approval || t.risk_level === "sensitive" ? " · goedkeuring" : ""}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Kennisbanken (RAG)</p>
        {options.knowledgeBases.map((kb) => (
          <label key={kb.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
            <input type="checkbox" className="accent-[#14b8a6]" checked={settings.knowledgeBaseIds.includes(kb.id)} onChange={() => persistSettings({ knowledgeBaseIds: toggle(settings.knowledgeBaseIds, kb.id) })} />
            <span className="flex-1">{kb.name}</span>
            <span className="text-xs text-muted-foreground">{kb.documents} doc.</span>
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <div className="grid h-[calc(100dvh-7.5rem)] min-h-[520px] gap-4 lg:h-[calc(100dvh-4rem)] lg:grid-cols-[250px_1fr] xl:grid-cols-[250px_1fr_300px]">
      {/* Gesprekken */}
      <aside className="hidden min-h-0 flex-col rounded-2xl border border-border bg-card lg:flex">
        <div className="p-3">
          <Button className="w-full" variant="accent" onClick={() => selectConversation(null)}><Plus /> Nieuw gesprek</Button>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {conversations.length === 0 && <li className="px-2 py-6 text-center text-xs text-muted-foreground">Nog geen gesprekken</li>}
          {conversations.map((c) => (
            <li key={c.id} className="group relative">
              <button onClick={() => selectConversation(c.id)} className={cn("w-full rounded-xl px-3 py-2 text-left hover:bg-muted", c.id === activeId && "bg-accent")}>
                <span className="block truncate pr-6 text-[13px] font-medium">{c.title}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{c.model_id} · {timeAgo(c.updated_at)}</span>
              </button>
              <button onClick={() => remove(c.id)} aria-label="Verwijderen" className="absolute right-2 top-2.5 hidden rounded p-1 text-muted-foreground hover:text-danger group-hover:block">
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Chat */}
      <section className="flex min-h-0 flex-col rounded-2xl border border-border bg-card">
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-semibold">{conversations.find((c) => c.id === activeId)?.title ?? "Nieuw gesprek"}</h1>
            <p className="text-xs text-muted-foreground">
              {parseModelValue(settings.model).modelId || "geen model"} · {formatNumber(totals.tokens)} tokens · {formatUsd(totals.cost)}
            </p>
          </div>
          {parseModelValue(settings.model).provider === "demo" && <Badge tone="demo">DEMO</Badge>}
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => selectConversation(null)} aria-label="Nieuw gesprek"><Plus /></Button>
          <Button variant="ghost" size="icon" className="xl:hidden" onClick={() => setShowSettings(!showSettings)} aria-label="Instellingen"><Settings2 /></Button>
        </header>
        {showSettings && (
          <div className="max-h-[50vh] overflow-y-auto border-b border-border p-4 xl:hidden">
            <div className="mb-2 flex justify-end"><button onClick={() => setShowSettings(false)} aria-label="Sluiten"><X className="size-4" /></button></div>
            {settingsPanel}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {messages.length === 0 ? (
            <EmptyState icon={<MessagesSquare />} title="Start een gesprek" description="Kies een model, eventueel tools en kennisbanken, en stel je vraag. Antwoorden worden live gestreamd en verbruik en kosten worden geregistreerd." />
          ) : (
            <MessageList messages={messages} pending={pending} canDecide={canDecide} onDecide={decide} onSave={saveResult} slug={slug} />
          )}
          {error && (
            <div className="mt-4">
              <Alert
                tone="danger"
                title={error.setup ? "Verbinding nog niet ingesteld" : "Er ging iets mis"}
                action={error.setup ? <Button asChild size="sm"><Link href={`/w/${slug}/${error.setup.where.startsWith("tools") ? "tools?tab=integrations" : "settings?tab=providers"}`}><KeyRound /> Instellen</Link></Button> : undefined}
              >
                {error.message}
              </Alert>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        <form onSubmit={send} className="border-t border-border p-3">
          <div className="flex items-end gap-2 rounded-2xl border border-input bg-background p-2 focus-within:ring-2 focus-within:ring-ring/50">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={Math.min(6, Math.max(1, input.split("\n").length))}
              placeholder="Stel een vraag… (Shift+Enter voor nieuwe regel)"
              aria-label="Bericht"
              className="max-h-48 flex-1 resize-none bg-transparent px-2 py-1.5 text-[14.5px] outline-none"
            />
            {busy ? (
              <Button type="button" size="icon" variant="secondary" onClick={() => abortRef.current?.abort()} aria-label="Stoppen"><Square /></Button>
            ) : (
              <Button type="submit" size="icon" variant="accent" disabled={!input.trim()} aria-label="Versturen"><Send /></Button>
            )}
          </div>
        </form>
      </section>

      {/* Instellingen */}
      <aside className="hidden min-h-0 overflow-y-auto rounded-2xl border border-border bg-card p-4 xl:block">
        <p className="mb-3 text-sm font-semibold">Gespreksinstellingen</p>
        {settingsPanel}
      </aside>

      {prompt && (
        <TemplateDialog
          open={templateOpen}
          onOpenChange={setTemplateOpen}
          template={prompt.user_template}
          variables={(prompt.variables as { name: string; description?: string; default?: string }[]) ?? []}
          onApply={(text) => {
            setInput(text);
            setTemplateOpen(false);
          }}
        />
      )}
    </div>
  );
}

function TemplateDialog({ open, onOpenChange, template, variables, onApply }: { open: boolean; onOpenChange: (o: boolean) => void; template: string; variables: { name: string; description?: string; default?: string }[]; onApply: (t: string) => void }) {
  const names = [...new Set([...template.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g)].map((m) => m[1]))];
  const [values, setValues] = useState<Record<string, string>>({});
  const render = () => template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_m, n: string) => values[n] ?? variables.find((v) => v.name === n)?.default ?? "");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Gebruikersprompt invullen" description="Vul de variabelen in; het resultaat komt in het invoerveld.">
        <div className="flex flex-col gap-3">
          {names.map((n) => (
            <Field key={n} label={n} hint={variables.find((v) => v.name === n)?.description}>
              <Input value={values[n] ?? variables.find((v) => v.name === n)?.default ?? ""} onChange={(e) => setValues({ ...values, [n]: e.target.value })} />
            </Field>
          ))}
          <Button variant="accent" onClick={() => onApply(render())}>Invoegen</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
