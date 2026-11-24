import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/auth/context";
import { withTenant } from "@/lib/db";
import { studioOptions } from "@/lib/studio-options";
import { serialize } from "@/lib/utils";
import { Badge, PageHeader, StatusBadge } from "@/components/ui/misc";
import { AgentDetail } from "@/components/agents/agent-detail";
import { AgentForm, EMPTY_AGENT } from "@/components/agents/agent-form";

export const metadata = { title: "Agent" };

export default async function AgentPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const ctx = await requireOrg(org, "agents.view");
  const options = await studioOptions(ctx.tenant, ctx.role);
  const others = await withTenant(ctx.tenant, (tx) => tx<{ key: string; name: string; id: string }[]>`select id, key, name from agents order by name`);

  if (id === "new") {
    if (!ctx.can("agents.manage")) notFound();
    return (
      <>
        <PageHeader eyebrow="Agent Builder" title="Nieuwe agent" actions={<Link href={`/w/${org}/agents`} className="text-sm text-muted-foreground hover:underline">← Alle agents</Link>} />
        <AgentForm slug={org} agent={EMPTY_AGENT} options={options} otherAgents={others} canManage />
      </>
    );
  }
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await withTenant(ctx.tenant, async (tx) => {
    const [agent] = await tx`select * from agents where id = ${id}`;
    if (!agent) return null;
    const tools = await tx<{ key: string }[]>`select t.key from agent_tools at join tools t on t.id = at.tool_id where at.agent_id = ${id}`;
    const kbs = await tx<{ knowledge_base_id: string }[]>`select knowledge_base_id from agent_knowledge_bases where agent_id = ${id}`;
    const runs = await tx`
      select r.id, r.status, t.title, r.steps_count, r.cost_usd, r.created_at, r.error, t.orchestration_id
        from agent_runs r left join agent_tasks t on t.id = r.task_id where r.agent_id = ${id} order by r.created_at desc limit 50`;
    return serialize({ agent: { ...agent, tool_keys: tools.map((t) => t.key), knowledge_base_ids: kbs.map((k) => k.knowledge_base_id) }, runs });
  });
  if (!data) notFound();
  const a = data.agent as unknown as Parameters<typeof AgentDetail>[0]["agent"] & { role_title: string; status: string };
  return (
    <>
      <PageHeader
        eyebrow={`Agent Builder · ${a.department}`}
        title={a.name}
        description={a.description}
        actions={<><StatusBadge status={a.is_enabled ? a.status : "disabled"} />{a.provider === "demo" && <Badge tone="demo">demo</Badge>}<Link href={`/w/${org}/agents`} className="text-sm text-muted-foreground hover:underline">← Alle agents</Link></>}
      />
      <AgentDetail
        slug={org}
        agent={a}
        options={options}
        otherAgents={others.filter((o) => o.id !== id)}
        runs={data.runs as never}
        canManage={ctx.can("agents.manage")}
        canRun={ctx.can("agents.run")}
      />
    </>
  );
}
