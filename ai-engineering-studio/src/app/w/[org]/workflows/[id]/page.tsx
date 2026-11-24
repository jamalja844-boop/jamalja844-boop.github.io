import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/auth/context";
import { withTenant } from "@/lib/db";
import { studioOptions } from "@/lib/studio-options";
import { serialize } from "@/lib/utils";
import { PageHeader, StatusBadge } from "@/components/ui/misc";
import { WorkflowEditor } from "@/components/workflows/workflow-editor";

export const metadata = { title: "Workflow" };

export default async function WorkflowPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const ctx = await requireOrg(org, "agents.view");
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await withTenant(ctx.tenant, async (tx) => {
    const [workflow] = await tx`select id, name, description, status, version, graph from workflows where id = ${id}`;
    if (!workflow) return null;
    const agents = await tx`select id, name from agents where is_enabled order by name`;
    const runs = await tx`select id, status, created_at from workflow_runs where workflow_id = ${id} order by created_at desc limit 10`;
    return serialize({ workflow, agents, runs });
  });
  if (!data) notFound();
  const options = await studioOptions(ctx.tenant, ctx.role);
  const wf = data.workflow as { name: string; description: string; status: string };
  return (
    <>
      <PageHeader eyebrow="Workflow-editor" title={wf.name} description={wf.description} actions={<><StatusBadge status={wf.status} /><Link href={`/w/${org}/workflows`} className="text-sm text-muted-foreground hover:underline">← Alle workflows</Link></>} />
      <WorkflowEditor
        slug={org}
        workflow={data.workflow as never}
        options={options}
        agents={data.agents as never}
        canManage={ctx.can("workflows.manage")}
        canRun={ctx.can("workflows.run")}
        recentRuns={data.runs as never}
      />
    </>
  );
}
