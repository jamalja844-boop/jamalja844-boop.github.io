import { requireOrg } from "@/lib/auth/context";
import { withTenant } from "@/lib/db";
import { studioOptions } from "@/lib/studio-options";
import { serialize } from "@/lib/utils";
import { PageHeader } from "@/components/ui/misc";
import { NewOrchestration } from "@/components/orchestrator/orchestrator-client";

export const metadata = { title: "Multi-Agent Orchestrator" };

export default async function OrchestratorPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireOrg(org, "agents.view");
  const [options, data] = await Promise.all([
    studioOptions(ctx.tenant, ctx.role),
    withTenant(ctx.tenant, async (tx) => {
      const recent = await tx`
        select o.id, o.title, o.status, o.cost_usd, o.created_at,
               (select count(*)::int from agent_tasks t where t.orchestration_id = o.id) as tasks,
               (select count(*)::int from agent_tasks t where t.orchestration_id = o.id and t.status in ('succeeded','failed','cancelled')) as done
          from orchestrations o order by o.created_at desc limit 20`;
      const [c] = await tx<{ n: number }[]>`select count(*)::int as n from agents where is_enabled`;
      return serialize({ recent, agentCount: c.n });
    }),
  ]);
  return (
    <>
      <PageHeader eyebrow="Module 7 · Multi-Agent / Agentic AI" title="AI Orchestrator" description="Laat meerdere agents samenwerken: de Orchestrator verdeelt het werk, deelt resultaten alleen volgens de toegangsrechten en rapporteert." />
      <NewOrchestration slug={org} options={options} recent={data.recent as never} agentCount={data.agentCount} />
    </>
  );
}
