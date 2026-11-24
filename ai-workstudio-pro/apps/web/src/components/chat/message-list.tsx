"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronDown, ChevronRight, CircleAlert, Save, ShieldCheck, Sparkles, User, Wrench } from "lucide-react";
import { Markdown } from "@/components/chat/markdown";
import { Badge, JsonView } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { cn, formatNumber, formatUsd } from "@/lib/utils";

export interface UiMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  tool_calls?: { id: string; name: string; input: unknown }[] | null;
  tool_call_id?: string | null;
  tool_name?: string | null;
  is_error?: boolean;
  citations?: { n: number; documentId: string; title: string; page: number | null; excerpt: string }[] | null;
  metadata?: Record<string, unknown>;
  provider?: string | null;
  model_id?: string | null;
  input_tokens?: number;
  output_tokens?: number;
  cost_usd?: string | number | null;
  streaming?: boolean;
}

export interface PendingApproval {
  id: string;
  toolKey: string;
}

function ToolCard({ name, input, result, pending }: { name: string; input: unknown; result?: UiMessage; pending?: boolean }) {
  const [open, setOpen] = useState(false);
  const status = (result?.metadata?.status as string | undefined) ?? (result ? (result.is_error ? "failed" : "succeeded") : pending ? "pending_approval" : "running");
  const tone = status === "succeeded" ? "success" : status === "pending_approval" ? "warning" : status === "running" ? "turq" : "danger";
  const label = { succeeded: "uitgevoerd", pending_approval: "wacht op goedkeuring", running: "bezig…", failed: "mislukt", rejected: "geweigerd" }[status] ?? status;
  return (
    <div className="rounded-xl border border-border bg-muted/40 text-sm" data-testid="tool-card">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        <Wrench className="size-3.5 text-brand-sky-strong dark:text-brand-sky" />
        <span className="font-mono text-[12.5px] font-semibold">{name}</span>
        <Badge tone={tone} className="ml-auto">{label}</Badge>
      </button>
      {open && (
        <div className="grid gap-2 border-t border-border p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Invoer</p>
          <JsonView value={input} />
          {result && (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Resultaat</p>
              <JsonView value={(result.metadata?.output as unknown) ?? result.content} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function MessageList({
  messages,
  pending,
  canDecide,
  onDecide,
  onSave,
  slug,
}: {
  messages: UiMessage[];
  pending: PendingApproval[];
  canDecide: boolean;
  onDecide: (approvalId: string, approve: boolean) => void;
  onSave?: (m: UiMessage) => void;
  slug: string;
}) {
  const toolResults = new Map(messages.filter((m) => m.role === "tool").map((m) => [m.tool_call_id, m]));
  return (
    <div className="flex flex-col gap-5">
      {messages.map((m) => {
        if (m.role === "tool" || m.role === "system") return null;
        if (m.role === "user") {
          return (
            <div key={m.id} className="flex justify-end gap-3 animate-slide-up">
              <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-navy-900 px-4 py-2.5 text-[14.5px] leading-relaxed text-white whitespace-pre-wrap dark:bg-brand-sky/15 dark:text-foreground">
                {m.content}
              </div>
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-accent"><User className="size-4" /></span>
            </div>
          );
        }
        const demo = m.provider === "demo" || Boolean(m.metadata?.demo);
        const notes = (m.metadata?.notes as string[] | undefined)?.filter((n) => !n.startsWith("Demo-simulator")) ?? [];
        return (
          <div key={m.id} className="flex gap-3 animate-slide-up" data-testid="assistant-message">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-sky to-turq-400 text-navy-950">
              <Sparkles className="size-4" />
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              {(m.content || m.streaming) && (
                <div className={cn("rounded-2xl rounded-tl-md border border-border bg-card px-4 py-3", demo && "border-fuchsia-400/40")}>
                  {demo && <Badge tone="demo" className="mb-2">DEMO-SIMULATOR · geen echte AI</Badge>}
                  <Markdown text={m.content} />
                  {m.streaming && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse-soft rounded-sm bg-turq-400 align-middle" />}
                </div>
              )}
              {m.tool_calls?.map((tc) => (
                <ToolCard key={tc.id} name={tc.name} input={tc.input} result={toolResults.get(tc.id)} pending={pending.some((p) => p.toolKey === tc.name) && !toolResults.get(tc.id)} />
              ))}
              {m.citations && m.citations.length > 0 && (
                <div className="flex flex-wrap gap-1.5" aria-label="Bronnen">
                  {m.citations.map((c) => (
                    <span key={c.n} title={c.excerpt} className="inline-flex items-center gap-1 rounded-lg border border-turq-400/30 bg-turq-400/8 px-2 py-1 text-xs">
                      <BookOpen className="size-3 text-turq-500" />
                      <b>Bron {c.n}</b> {c.title}{c.page ? `, p. ${c.page}` : ""}
                    </span>
                  ))}
                </div>
              )}
              {notes.map((n) => (
                <p key={n} className="flex items-center gap-1.5 text-xs text-warning"><CircleAlert className="size-3.5" />{n}</p>
              ))}
              {!m.streaming && (m.input_tokens || m.output_tokens) ? (
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span>{m.model_id} · {formatNumber(m.input_tokens ?? 0)} in / {formatNumber(m.output_tokens ?? 0)} uit · {formatUsd(m.cost_usd)}</span>
                  {onSave && m.content.trim() && (
                    <button onClick={() => onSave(m)} className="inline-flex items-center gap-1 font-semibold text-brand-sky-strong hover:underline dark:text-brand-sky" data-testid="save-result">
                      <Save className="size-3" /> Resultaat opslaan
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
      {pending.length > 0 && (
        <div className="ml-11 rounded-2xl border border-warning/40 bg-warning/8 p-4" data-testid="approval-card">
          <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4 text-warning" /> Goedkeuring vereist</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {pending.map((p) => p.toolKey).join(", ")} is een gevoelige actie en wordt pas uitgevoerd na goedkeuring door een beheerder.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {canDecide ? (
              pending.map((p) => (
                <div key={p.id} className="flex gap-2">
                  <Button size="sm" variant="accent" onClick={() => onDecide(p.id, true)}>Goedkeuren &amp; uitvoeren</Button>
                  <Button size="sm" variant="danger" onClick={() => onDecide(p.id, false)}>Afwijzen</Button>
                </div>
              ))
            ) : (
              <Button asChild size="sm" variant="secondary"><Link href={`/w/${slug}/approvals`}>Naar goedkeuringen</Link></Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
