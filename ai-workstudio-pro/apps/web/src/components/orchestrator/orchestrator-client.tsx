"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Bot, Network, StopCircle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Badge, EmptyState, StatusBadge } from "@/components/ui/misc";
import { Markdown } from "@/components/chat/markdown";
import { RunView } from "@/components/agents/run-view";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { ModelSelect, defaultModel, parseModelValue } from "@/components/shared/model-select";
import { api, ClientApiError } from "@/lib/client/api";
import type { StudioOptions } from "@/lib/studio-options";
import { cn, formatUsd, timeAgo } from "@/lib/utils";

interface OrchRow { id: string; title: string; status: string; cost_usd: string; created_at: string; tasks: number; done: number }

export function NewOrchestration({ slug, options, recent, agentCount }: { slug: string; options: StudioOptions; recent: OrchRow[]; agentCount: number }) {
  const router = useRouter();
  const [goal, setGoal] = useState("");
  const [model, setModel] = useState(defaultModel(options.models));
  const [budget, setBudget] = useState("2");
  const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await api.post<{ id: string }>(`/api/w/${slug}/orchestrations`, { goal, ...parseModelValue(model), maxCostUsd: Number(budget) });
      router.push(`/w/${slug}/orchestrator/${r.id}`);
    } catch (err) {
      toast.error(err instanceof ClientApiError ? err.message : "Starten mislukt");
      setLoading(false);
    }
  }
  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-turq-400/10 blur-3xl" />
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Network className="size-4 text-turq-500" /> Opdracht aan het AI-team</CardTitle>
          <CardDescription>De Orchestrator analyseert de opdracht, verdeelt die in deeltaken, kiest de juiste agents ({agentCount} beschikbaar), bewaakt de voortgang en stelt een eindrapport samen.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field label="Opdracht"><Textarea required minLength={5} rows={5} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Bijv. Er is een nieuwe aanvraag van een huisartsenpraktijk in Zeist voor dagelijkse schoonmaak. Registreer de klant, maak een offerteconcept en plan een kennismakingsbezoek." /></Field>
            <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
              <Field label="Model van de Orchestrator"><ModelSelect models={options.models} value={model} onChange={setModel} /></Field>
              <Field label="Budget (USD)"><Input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} /></Field>
            </div>
            <Button type="submit" variant="accent" loading={loading} disabled={!agentCount}><Zap /> Opdracht starten</Button>
            {!agentCount && <p className="text-sm text-warning">Maak eerst agents aan in de Agent Builder.</p>}
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Recente opdrachten</CardTitle></CardHeader>
        <CardContent>
          {recent.length === 0 ? <EmptyState icon={<Network />} title="Nog geen opdrachten" /> : (
            <ul className="flex flex-col gap-1">
              {recent.map((o) => (
                <li key={o.id}>
                  <Link href={`/w/${slug}/orchestrator/${o.id}`} className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-muted">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{o.title}</p>
                      <p className="text-xs text-muted-foreground">{o.done}/{o.tasks} taken · {formatUsd(o.cost_usd)} · {timeAgo(o.created_at)}</p>
                    </div>
                    <StatusBadge status={o.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface Task { id: string; plan_key: string; title: string; instructions: string; status: string; depends_on: string[]; result: string | null; error: string | null; agent_id: string; agent_key: string; agent_name: string; avatar_color: string; run: { id: string; status: string; steps_count: number; cost_usd: string } | null }
interface Orch { id: string; title: string; goal: string; status: string; plan: { analysis: string } | null; final_report: string | null; error: string | null; cost_usd: string; max_cost_usd: string; provider: string; model_id: string; created_at: string }

export function OrchestrationView({ slug, initial }: { slug: string; initial: { orchestration: Orch; tasks: Task[] } }) {
  const [data, setData] = useState(initial);
  const [runId, setRunId] = useState<string | null>(null);
  const live = ["planning", "running", "waiting_approval", "reporting"].includes(data.orchestration.status);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(async () => {
      try {
        setData(await api.get(`/api/w/${slug}/orchestrations/${data.orchestration.id}`));
      } catch {
        /* volgende poging */
      }
    }, 2000);
    return () => clearInterval(t);
  }, [live, slug, data.orchestration.id]);

  const o = data.orchestration;
  const done = data.tasks.filter((t) => ["succeeded", "failed", "cancelled"].includes(t.status)).length;
  const pct = data.tasks.length ? Math.round((done / data.tasks.length) * 100) : o.status === "planning" ? 5 : 0;

  async function cancel() {
    if (!confirm("Opdracht annuleren?")) return;
    await api.del(`/api/w/${slug}/orchestrations/${o.id}`);
    setData(await api.get(`/api/w/${slug}/orchestrations/${o.id}`));
  }

  return (
    <div className="flex flex-col gap-6" data-testid="orchestration-view">
      <Card>
        <CardContent className="flex flex-col gap-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={o.status} />
            {o.provider === "demo" && <Badge tone="demo">demo</Badge>}
            <span className="text-sm text-muted-foreground">{done}/{data.tasks.length} deeltaken · {formatUsd(o.cost_usd)} van {formatUsd(o.max_cost_usd, 2)} budget</span>
            {live && <Button size="sm" variant="ghost" className="ml-auto" onClick={cancel}><StopCircle /> Annuleren</Button>}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full bg-gradient-to-r from-brand-sky to-turq-400 transition-all duration-700", live && "animate-pulse-soft")} style={{ width: `${o.status === "completed" ? 100 : pct}%` }} />
          </div>
          <p className="text-sm"><span className="font-semibold">Opdracht:</span> {o.goal}</p>
          {o.plan?.analysis && <p className="text-sm text-muted-foreground"><span className="font-semibold text-foreground">Analyse:</span> {o.plan.analysis}</p>}
          {o.error && <p className="text-sm text-warning">{o.error}</p>}
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Deeltaken (gestructureerd takenprotocol)</h2>
        {data.tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{o.status === "planning" ? "De Orchestrator analyseert de opdracht…" : "Geen deeltaken."}</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.tasks.map((t) => (
              <button key={t.id} onClick={() => t.run && setRunId(t.run.id)} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 text-left transition hover:border-brand-sky/50" data-testid="orchestration-task">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] font-bold">{t.plan_key}</span>
                  <StatusBadge status={t.status} />
                  {t.depends_on.length > 0 && <span className="ml-auto flex items-center gap-1 font-mono text-[11px] text-muted-foreground">{t.depends_on.join(", ")} <ArrowRight className="size-3" /> {t.plan_key}</span>}
                </div>
                <p className="font-semibold leading-snug">{t.title}</p>
                <div className="flex items-center gap-2 text-sm">
                  <span className="grid size-6 place-items-center rounded-md text-navy-950" style={{ background: t.avatar_color }}><Bot className="size-3.5" /></span>
                  {t.agent_name}
                </div>
                {t.error && <p className="text-xs text-warning">{t.error}</p>}
                {t.result && <p className="line-clamp-3 text-xs text-muted-foreground">{t.result}</p>}
                {t.run && <p className="text-[11px] text-muted-foreground">{t.run.steps_count} stappen · {formatUsd(t.run.cost_usd)} · klik voor logging</p>}
              </button>
            ))}
          </div>
        )}
      </div>

      {o.final_report && (
        <Card className="border-turq-400/40">
          <CardHeader><CardTitle>Eindrapport</CardTitle><CardDescription>Samengesteld door de Orchestrator uit de resultaten van alle agents.</CardDescription></CardHeader>
          <CardContent><Markdown text={o.final_report} /></CardContent>
        </Card>
      )}

      <Dialog open={Boolean(runId)} onOpenChange={(v) => !v && setRunId(null)}>
        {runId && <DialogContent title="Logging van de agent" wide><RunView slug={slug} runId={runId} /></DialogContent>}
      </Dialog>
    </div>
  );
}
