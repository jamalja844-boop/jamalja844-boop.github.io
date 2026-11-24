import Link from "next/link";
import {
  AlertTriangle, Blocks, Bot, CircleCheck, Coins, Cpu, KeyRound, Library, ListChecks, Plug, ScrollText, ShieldCheck, Zap,
} from "lucide-react";
import { requireOrg } from "@/lib/auth/context";
import { dashboardSummary, liveActivity } from "@/lib/dashboard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Badge, PageHeader, Stat } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { LivePanel } from "@/components/dashboard/live-panel";
import { BarChart } from "@/components/dashboard/bar-chart";
import { PROVIDER_LABELS } from "@/lib/ai/catalog";
import { cn, formatNumber, formatUsd, timeAgo } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireOrg(org, "dashboard.view");
  const [s, live] = await Promise.all([dashboardSummary(ctx.tenant), liveActivity(ctx.tenant)]);
  const c = s.counts;
  const base = `/w/${org}`;
  const anyProvider = s.providers.some((p) => p.configured && p.provider !== "demo");

  const steps = [
    { done: s.firstRoute.provider_configured, label: "AI-provider koppelen", href: `${base}/settings?tab=providers` },
    { done: s.firstRoute.chatted, label: "Schrijfopdracht in AI Chat", href: `${base}/chat` },
    { done: s.firstRoute.document_saved, label: "Resultaat opslaan als document", href: `${base}/writing` },
    { done: s.firstRoute.project_opened, label: "Project openen in AI Code", href: `${base}/code` },
    { done: s.firstRoute.code_task_done, label: "AI Code-taak uitvoeren", href: `${base}/code` },
  ];
  const doneCount = steps.filter((x) => x.done).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="AI WorkStudio Pro · Dashboard"
        title={`Goedendag, ${ctx.user.name.split(" ")[0]}`}
        description={`Overzicht van alle AI-functionaliteit in ${ctx.org.name}: modellen, tools, apps, agents, kennisbanken, verbruik en goedkeuringen.`}
        actions={
          <>
            <Button asChild variant="secondary"><Link href={`${base}/chat`}>Nieuwe chat</Link></Button>
            <Button asChild variant="accent"><Link href={`${base}/orchestrator`}><Zap /> Opdracht aan AI-team</Link></Button>
          </>
        }
      />

      {!anyProvider && (
        <Alert
          tone="warning"
          title="Nog geen AI-provider gekoppeld"
          action={<Button asChild size="sm"><Link href={`${base}/settings?tab=providers`}><KeyRound /> Verbinding instellen</Link></Button>}
        >
          Stel een API-sleutel in voor Anthropic (Claude) of OpenAI om echte AI-antwoorden te krijgen.
          {s.providers.some((p) => p.provider === "demo") && " Tot die tijd kun je de duidelijk gemarkeerde demo-simulator gebruiken."}
        </Alert>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label="Kerncijfers">
        <Stat label="Actieve modellen" value={c.models} icon={<Cpu />} sub={s.providers.filter((p) => p.configured).map((p) => PROVIDER_LABELS[p.provider]).join(" · ") || "geen provider"} />
        <Stat label="Tools" value={`${c.tools}/${c.tools_total}`} icon={<Plug />} sub="ingeschakeld" />
        <Stat label="AI-apps" value={c.apps_published} icon={<Blocks />} sub={`${c.apps_total} totaal`} />
        <Stat label="AI-agents" value={c.agents} icon={<Bot />} sub={`${c.agents_working} nu aan het werk`} accent={c.agents_working > 0} />
        <Stat label="Lopende taken" value={c.tasks_open} icon={<ListChecks />} sub="open of bezig" />
        <Stat label="Kennisbanken" value={c.knowledge_bases} icon={<Library />} sub={`${c.documents} documenten`} />
        <Stat label="API-verbruik" value={formatNumber(c.tokens_month)} icon={<Zap />} sub={`tokens · ${c.calls_month} aanroepen deze maand`} />
        <Stat label="Kosten" value={formatUsd(c.cost_month, 2)} icon={<Coins />} sub={ctx.org.monthlyBudgetUsd ? `van ${formatUsd(ctx.org.monthlyBudgetUsd, 2)} budget` : "deze maand"} />
        <Stat label="Foutmeldingen" value={c.provider_errors_7d + c.agent_errors_7d + c.tool_errors_7d} icon={<AlertTriangle />} sub="laatste 7 dagen" />
        <Stat label="Goedkeuringen" value={c.approvals_pending} icon={<ShieldCheck />} sub="wachten op besluit" accent={c.approvals_pending > 0} />
        <Stat label="Prompts" value={c.prompts} icon={<ScrollText />} sub={`${c.conversations} gesprekken`} />
        <Stat label="Workflows" value={c.workflows} icon={<Bot />} sub="multi-agent" />
      </section>

      <LivePanel slug={org} initial={live} />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>API-verbruik en kosten</CardTitle>
            <CardDescription>Alle LLM- en embedding-aanroepen van deze workspace</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
            <BarChart data={s.costByDay} />
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Per model (deze maand)</p>
              {s.byModel.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nog geen verbruik.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {s.byModel.map((m) => (
                    <li key={m.provider + m.model_id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">
                        <span className="font-medium">{m.model_id}</span>
                        {m.provider === "demo" && <Badge tone="demo" className="ml-1.5">demo</Badge>}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{formatNumber(m.tokens)} · {formatUsd(m.cost)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Eerste gebruikersroute</CardTitle>
            <CardDescription>{doneCount} van {steps.length} stappen voltooid</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-gradient-to-r from-brand-sky to-turq-400 transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
            </div>
            <ol className="flex flex-col gap-1">
              {steps.map((step, i) => (
                <li key={step.label}>
                  <Link href={step.href} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
                    <span className={cn("grid size-6 place-items-center rounded-full border text-[11px] font-bold", step.done ? "border-turq-400 bg-turq-400/15 text-turq-600 dark:text-turq-300" : "border-border text-muted-foreground")}>
                      {step.done ? <CircleCheck className="size-3.5" /> : i + 1}
                    </span>
                    <span className={cn(step.done && "text-muted-foreground line-through")}>{step.label}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><AlertTriangle className="size-4 text-warning" /> Recente foutmeldingen</CardTitle>
          <CardDescription>Provider-, agent- en toolfouten</CardDescription>
        </CardHeader>
        <CardContent>
          {s.errors.length === 0 ? (
            <p className="text-sm text-muted-foreground">Geen fouten geregistreerd. 🎉</p>
          ) : (
            <ul className="divide-y divide-border">
              {s.errors.map((e, i) => (
                <li key={i} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-center sm:gap-3">
                  <Badge tone="danger">{e.kind}</Badge>
                  <span className="text-sm font-medium">{e.title}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{e.detail}</span>
                  <span className="text-xs text-muted-foreground">{timeAgo(e.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
