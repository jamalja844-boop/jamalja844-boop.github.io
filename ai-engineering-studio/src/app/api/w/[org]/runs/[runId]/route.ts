import { z } from "zod";
import { orgHandler } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { withTenant } from "@/lib/db";

/** Live status van een agentrun met alle stappen (logging). */
export const GET = orgHandler<{ org: string; runId: string }>({ permission: "agents.view" }, async ({ ctx, params }) => {
  const runId = z.string().uuid().parse(params.runId);
  return withTenant(ctx.tenant, async (tx) => {
    const [run] = await tx`
      select r.id, r.status, r.output, r.error, r.plan, r.verification, r.steps_count, r.input_tokens, r.output_tokens, r.cost_usd,
             r.created_at, r.started_at, r.finished_at, r.pending_approval_id, r.provider, r.model_id, t.title, t.instructions, a.name as agent_name
        from agent_runs r join agents a on a.id = r.agent_id left join agent_tasks t on t.id = r.task_id where r.id = ${runId}`;
    if (!run) throw notFound("Run");
    const steps = await tx`select id, step_index, phase, title, content, tool_key, tool_input, tool_output, status, input_tokens, output_tokens, created_at
                             from agent_run_steps where run_id = ${runId} order by id`;
    return { run, steps };
  });
});
