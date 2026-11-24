import type { Tx } from "@/lib/db";

/** Orchestratie met deeltaken en laatste run per taak (voor voortgangsweergave). */
export async function loadOrchestration(tx: Tx, id: string) {
  const [orchestration] = await tx`
    select o.id, o.title, o.goal, o.status, o.plan, o.final_report, o.error, o.cost_usd, o.max_cost_usd, o.provider, o.model_id, o.created_at, o.finished_at,
           u.name as created_by_name
      from orchestrations o left join users u on u.id = o.created_by where o.id = ${id}`;
  if (!orchestration) return null;
  const tasks = await tx`
    select t.id, t.plan_key, t.title, t.instructions, t.status, t.depends_on, t.result, t.error, t.started_at, t.finished_at,
           a.id as agent_id, a.key as agent_key, a.name as agent_name, a.avatar_color,
           (select row_to_json(r) from (select id, status, steps_count, cost_usd, input_tokens, output_tokens from agent_runs where task_id = t.id order by created_at desc limit 1) r) as run
      from agent_tasks t join agents a on a.id = t.agent_id where t.orchestration_id = ${id} order by t.created_at`;
  return { orchestration, tasks };
}

