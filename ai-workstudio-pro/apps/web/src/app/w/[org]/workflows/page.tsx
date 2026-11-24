import { requireOrg } from "@/lib/auth/context";
import { withTenant } from "@/lib/db";
import { serialize } from "@/lib/utils";
import { PageHeader } from "@/components/ui/misc";
import { WorkflowList } from "@/components/workflows/workflow-list";

export const metadata = { title: "Workflows" };

export default async function WorkflowsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireOrg(org, "agents.view");
  const workflows = await withTenant(ctx.tenant, (tx) => tx`
    select w.id, w.name, w.description, w.status, w.version, w.updated_at, jsonb_array_length(w.graph->'nodes') as nodes,
           (select count(*)::int from workflow_runs r where r.workflow_id = w.id) as runs
      from workflows w order by w.updated_at desc`);
  return (
    <>
      <PageHeader eyebrow="Module 8 · Workflow-editor" title="Workflows" description="Visuele multi-agent workflows met nodes en verbindingslijnen, bijvoorbeeld: Nieuwe aanvraag → CRM Agent → Offerte Agent → Controle → Goedkeuring → E-mailconcept." />
      <WorkflowList slug={org} workflows={serialize(workflows) as never} canManage={ctx.can("workflows.manage")} />
    </>
  );
}
