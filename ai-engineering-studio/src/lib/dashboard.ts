import { withTenant, type TenantContext } from "@/lib/db";
import { providerStatuses } from "@/lib/ai/service";
import { serialize } from "@/lib/utils";

export async function dashboardSummary(ctx: TenantContext) {
  return withTenant(ctx, async (tx) => {
    const [counts] = await tx<Record<string, number>[]>`
      select
        (select count(*)::int from ai_models where is_enabled and kind = 'chat') as models,
        (select count(*)::int from tools where is_enabled) as tools,
        (select count(*)::int from tools) as tools_total,
        (select count(*)::int from ai_apps where status = 'published') as apps_published,
        (select count(*)::int from ai_apps) as apps_total,
        (select count(*)::int from agents where is_enabled) as agents,
        (select count(*)::int from agents where status = 'working') as agents_working,
        (select count(*)::int from agent_tasks where status in ('queued','running','waiting_approval','blocked')) as tasks_open,
        (select count(*)::int from knowledge_bases) as knowledge_bases,
        (select count(*)::int from documents where status = 'ready') as documents,
        (select count(*)::int from approval_requests where status = 'pending') as approvals_pending,
        (select count(*)::int from prompts) as prompts,
        (select count(*)::int from conversations) as conversations,
        (select count(*)::int from workflows) as workflows,
        (select coalesce(sum(input_tokens + output_tokens), 0)::int from usage_events where created_at >= date_trunc('month', now())) as tokens_month,
        (select coalesce(sum(cost_usd), 0)::float from usage_events where created_at >= date_trunc('month', now())) as cost_month,
        (select count(*)::int from usage_events where created_at >= date_trunc('month', now())) as calls_month,
        (select count(*)::int from usage_events where not success and created_at > now() - interval '7 days') as provider_errors_7d,
        (select count(*)::int from agent_runs where status = 'failed' and created_at > now() - interval '7 days') as agent_errors_7d,
        (select count(*)::int from tool_executions where status = 'failed' and created_at > now() - interval '7 days') as tool_errors_7d`;

    const costByDay = await tx<{ day: string; cost: number; tokens: number }[]>`
      select to_char(d.day, 'YYYY-MM-DD') as day,
             coalesce(sum(u.cost_usd), 0)::float as cost,
             coalesce(sum(u.input_tokens + u.output_tokens), 0)::int as tokens
        from generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') as d(day)
        left join usage_events u on date_trunc('day', u.created_at) = d.day
       group by d.day order by d.day`;

    const byModel = await tx<{ provider: string; model_id: string; calls: number; tokens: number; cost: number | null }[]>`
      select provider, model_id, count(*)::int as calls, sum(input_tokens + output_tokens)::int as tokens, sum(cost_usd)::float as cost
        from usage_events where created_at >= date_trunc('month', now())
       group by provider, model_id order by calls desc limit 6`;

    const errors = await tx<{ kind: string; title: string; detail: string | null; created_at: Date }[]>`
      (select 'AI-provider' as kind, provider || ' · ' || model_id as title, error_code as detail, created_at
         from usage_events where not success order by created_at desc limit 5)
      union all
      (select 'Agent' as kind, a.name as title, r.error as detail, r.created_at
         from agent_runs r join agents a on a.id = r.agent_id where r.status = 'failed' order by r.created_at desc limit 5)
      union all
      (select 'Tool' as kind, tool_key as title, error as detail, created_at
         from tool_executions where status = 'failed' order by created_at desc limit 5)
      order by created_at desc limit 8`;

    const providers = await providerStatuses(tx);
    // Alleen modellen van providers met een geldige verbinding tellen als "actief".
    const perProvider = await tx<{ provider: string; n: number }[]>`
      select provider, count(*)::int as n from ai_models where is_enabled and kind = 'chat' group by provider`;
    counts.models = perProvider
      .filter((p) => providers.some((s) => s.provider === p.provider && s.configured))
      .reduce((sum, p) => sum + p.n, 0);
    const [firstRoute] = await tx<Record<string, boolean>[]>`
      select
        exists (select 1 from credentials where kind = 'llm') as provider_configured,
        exists (select 1 from prompts) as prompt_created,
        exists (select 1 from messages where role = 'assistant') as chatted,
        exists (select 1 from tool_executions where status = 'succeeded') as tool_executed,
        exists (select 1 from records) as result_saved`;

    return serialize({ counts, costByDay, byModel, errors, providers, firstRoute });
  });
}

/** Live-gegevens voor het dashboard en het 3D-kantoor (lichtgewicht, wordt gepolld). */
export async function liveActivity(ctx: TenantContext) {
  return withTenant(ctx, async (tx) => {
    const agents = await tx<{
      id: string; key: string; name: string; role_title: string; department: string; status: string; status_detail: string | null;
      avatar_color: string; office_position: { x?: number; z?: number }; last_active_at: Date | null; open_tasks: number;
    }[]>`
      select a.id, a.key, a.name, a.role_title, a.department, a.status, a.status_detail, a.avatar_color, a.office_position, a.last_active_at,
             (select count(*)::int from agent_tasks t where t.agent_id = a.id and t.status in ('queued','running','waiting_approval','blocked')) as open_tasks
        from agents a where a.is_enabled order by a.department, a.name`;
    const tasks = await tx<{
      id: string; title: string; status: string; agent_name: string; agent_key: string; orchestration_id: string | null;
      workflow_run_id: string | null; updated_at: Date;
    }[]>`
      select t.id, t.title, t.status, a.name as agent_name, a.key as agent_key, t.orchestration_id, t.workflow_run_id, t.updated_at
        from agent_tasks t join agents a on a.id = t.agent_id
       where t.status in ('queued','running','waiting_approval','blocked') or t.updated_at > now() - interval '30 minutes'
       order by (t.status in ('running','waiting_approval')) desc, t.updated_at desc limit 20`;
    // Dataverbindingen: agents die samenwerken in een actieve orchestratie of workflow-run.
    const links = await tx<{ from_key: string; to_key: string; active: boolean }[]>`
      select distinct a1.key as from_key, a2.key as to_key,
             (t2.status in ('running','queued','waiting_approval')) as active
        from agent_tasks t1
        join agent_tasks t2 on t2.orchestration_id = t1.orchestration_id and t1.plan_key = any(t2.depends_on)
        join agents a1 on a1.id = t1.agent_id join agents a2 on a2.id = t2.agent_id
        join orchestrations o on o.id = t1.orchestration_id
       where o.created_at > now() - interval '1 day' and a1.id <> a2.id
       limit 40`;
    const [approvals] = await tx<{ n: number }[]>`select count(*)::int as n from approval_requests where status = 'pending'`;
    return serialize({ agents, tasks, links, pendingApprovals: approvals.n, at: new Date().toISOString() });
  });
}
