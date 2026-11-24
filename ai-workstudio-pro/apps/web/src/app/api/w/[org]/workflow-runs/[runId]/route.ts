import { z } from "zod";
import { orgHandler } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { withTenant } from "@/lib/db";

export const GET = orgHandler<{ org: string; runId: string }>({ permission: "agents.view" }, async ({ ctx, params }) => {
  const runId = z.string().uuid().parse(params.runId);
  return withTenant(ctx.tenant, async (tx) => {
    const [run] = await tx`select id, workflow_id, status, input, outputs, error, cost_usd, created_at, finished_at from workflow_runs where id = ${runId}`;
    if (!run) throw notFound("Workflow-run");
    const nodes = await tx`select node_id, node_type, status, input, output, error, agent_task_id, approval_id, started_at, finished_at
                             from workflow_node_runs where run_id = ${runId} order by started_at nulls last`;
    return { run, nodes };
  });
});
