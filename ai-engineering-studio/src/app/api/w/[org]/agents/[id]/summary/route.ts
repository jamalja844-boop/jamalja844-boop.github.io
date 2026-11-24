import { z } from "zod";
import { orgHandler } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { withTenant } from "@/lib/db";

/** Samenvatting van een agent voor het 3D-kantoor: taken, tools, resultaten en recente stappen. */
export const GET = orgHandler<{ org: string; id: string }>({ permission: "agents.view" }, async ({ ctx, params }) => {
  const id = z.string().uuid().parse(params.id);
  return withTenant(ctx.tenant, async (tx) => {
    const [agent] = await tx`select id, key, name, role_title, department, description, status, status_detail, provider, model_id, avatar_color, data_scopes, last_active_at from agents where id = ${id}`;
    if (!agent) throw notFound("Agent");
    const tools = await tx`select t.key, t.name, t.risk_level from agent_tools at join tools t on t.id = at.tool_id where at.agent_id = ${id} order by t.name`;
    const tasks = await tx`
      select t.id, t.title, t.status, t.result, t.error, t.updated_at, t.orchestration_id,
             (select id from agent_runs r where r.task_id = t.id order by r.created_at desc limit 1) as run_id
        from agent_tasks t where t.agent_id = ${id} order by t.updated_at desc limit 8`;
    const steps = await tx`
      select s.phase, s.title, s.tool_key, s.status, s.created_at from agent_run_steps s join agent_runs r on r.id = s.run_id
       where r.agent_id = ${id} order by s.id desc limit 12`;
    const [stats] = await tx`select count(*)::int as runs, coalesce(sum(cost_usd), 0)::float as cost,
                               count(*) filter (where status = 'succeeded')::int as succeeded from agent_runs where agent_id = ${id}`;
    return { agent, tools, tasks, steps, stats };
  });
});
