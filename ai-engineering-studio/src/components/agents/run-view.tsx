"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CircleAlert, CircleCheck, Hourglass, ListChecks, Search, Target, Wrench, Zap, ShieldCheck, Gauge } from "lucide-react";
import { Markdown } from "@/components/chat/markdown";
import { Badge, JsonView, StatusBadge } from "@/components/ui/misc";
import { api } from "@/lib/client/api";
import { cn, formatNumber, formatUsd, timeAgo } from "@/lib/utils";

interface Step { id: number; step_index: number; phase: string; title: string; content: string; tool_key: string | null; tool_input: unknown; tool_output: unknown; status: string; created_at: string }
interface Run { id: string; status: string; output: string | null; error: string | null; verification: { goal_met: boolean; summary: string; issues: string[] } | null; steps_count: number; input_tokens: number; output_tokens: number; cost_usd: string; title: string | null; agent_name: string; created_at: string; pending_approval_id: string | null; provider: string; model_id: string }

const PHASE: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  understand: { label: "Doel begrijpen", icon: Target, color: "text-brand-sky" },
  plan: { label: "Plan maken", icon: ListChecks, color: "text-brand-sky" },
  tool_select: { label: "Tool selecteren", icon: Search, color: "text-violet-400" },
  act: { label: "Actie uitvoeren", icon: Wrench, color: "text-turq-400" },
  verify: { label: "Resultaat controleren", icon: CircleCheck, color: "text-turq-400" },
  next: { label: "Volgende stap", icon: Zap, color: "text-muted-foreground" },
  final: { label: "Eindresultaat", icon: CircleCheck, color: "text-turq-400" },
  approval: { label: "Goedkeuring", icon: ShieldCheck, color: "text-warning" },
  limit: { label: "Limiet", icon: Gauge, color: "text-warning" },
  error: { label: "Fout", icon: CircleAlert, color: "text-danger" },
};

export function RunView({ slug, runId }: { slug: string; runId: string }) {
  const [data, setData] = useState<{ run: Run; steps: Step[] } | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const d = await api.get<{ run: Run; steps: Step[] }>(`/api/w/${slug}/runs/${runId}`);
        if (stop) return;
        setData(d);
        if (["queued", "running", "waiting_approval"].includes(d.run.status)) timer = setTimeout(load, 2000);
      } catch {
        timer = setTimeout(load, 4000);
      }
    };
    load();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [slug, runId]);

  if (!data) return <p className="text-sm text-muted-foreground">Laden…</p>;
  const { run, steps } = data;
  return (
    <div className="flex flex-col gap-4" data-testid="run-view">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={run.status} />
        <span className="font-semibold">{run.title}</span>
        {run.provider === "demo" && <Badge tone="demo">demo</Badge>}
        <span className="ml-auto text-xs text-muted-foreground">
          {run.steps_count} stappen · {formatNumber(run.input_tokens + run.output_tokens)} tokens · {formatUsd(run.cost_usd)} · {timeAgo(run.created_at)}
        </span>
      </div>
      {run.status === "waiting_approval" && (
        <Link href={`/w/${slug}/approvals`} className="flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/8 p-3 text-sm font-medium">
          <Hourglass className="size-4 text-warning" /> Deze agent wacht op goedkeuring van een beheerder → naar goedkeuringen
        </Link>
      )}
      <ol className="relative flex flex-col gap-1 border-l border-border pl-5">
        {steps.map((s) => {
          const meta = PHASE[s.phase] ?? PHASE.next;
          const Icon = meta.icon;
          return (
            <li key={s.id} className="relative">
              <span className={cn("absolute -left-[29px] top-2 grid size-[18px] place-items-center rounded-full bg-card ring-2 ring-border", meta.color)}>
                <Icon className="size-3" />
              </span>
              <button onClick={() => setOpen(open === s.id ? null : s.id)} className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-muted/60">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{meta.label}</span>
                <span className={cn("block text-sm font-medium", s.status === "error" && "text-danger", s.status === "waiting" && "text-warning")}>{s.title}</span>
              </button>
              {open === s.id && (s.content || s.tool_input || s.tool_output) ? (
                <div className="mb-2 grid gap-2 px-2">
                  {s.content && <div className="rounded-lg bg-muted/50 p-2 text-sm"><Markdown text={s.content} /></div>}
                  {s.tool_input ? <JsonView value={s.tool_input} /> : null}
                  {s.tool_output ? <JsonView value={s.tool_output} /> : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      {run.output && (
        <div className="rounded-2xl border border-turq-400/40 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-turq-600 dark:text-turq-300">Resultaat</p>
          <Markdown text={run.output} />
          {run.verification && (
            <p className={cn("mt-3 text-xs", run.verification.goal_met ? "text-turq-600 dark:text-turq-300" : "text-warning")}>
              Controle: {run.verification.goal_met ? "doel bereikt" : "niet volledig bereikt"} – {run.verification.summary}
            </p>
          )}
        </div>
      )}
      {run.error && <p className="rounded-xl border border-danger/40 bg-danger/8 p-3 text-sm text-danger">{run.error}</p>}
    </div>
  );
}
