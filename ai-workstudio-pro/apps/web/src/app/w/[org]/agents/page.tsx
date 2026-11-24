import { requireOrg } from "@/lib/auth/context";
import { withTenant } from "@/lib/db";
import { studioOptions } from "@/lib/studio-options";
import { serialize } from "@/lib/utils";
import { PageHeader } from "@/components/ui/misc";
import { AgentGrid } from "@/components/agents/agent-grid";

export const metadata = { title: "Agent Builder" };

export default async function AgentsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireOrg(org, "agents.view");
  const [agents, options] = await Promise.all([
    withTenant(ctx.tenant, (tx) => tx`
      select a.id, a.key, a.name, a.role_title, a.department, a.status, a.status_detail, a.model_id, a.provider, a.avatar_color, a.is_enabled,
             (select count(*)::int from agent_tools t where t.agent_id = a.id) as tools,
             (select count(*)::int from agent_runs r where r.agent_id = a.id) as runs
        from agents a order by a.department, a.name`),
    studioOptions(ctx.tenant, ctx.role),
  ]);
  return (
    <>
      <PageHeader eyebrow="Module 6 · AI Agent Builder" title="AI-agents" description="Zelfstandige, taakgerichte AI-medewerkers met eigen model, instructies, tools, kennisbank, toegangsrechten en limieten. Elke uitvoering wordt stap voor stap gelogd." />
      <AgentGrid slug={org} agents={serialize(agents) as never} options={options} canManage={ctx.can("agents.manage")} />
    </>
  );
}
