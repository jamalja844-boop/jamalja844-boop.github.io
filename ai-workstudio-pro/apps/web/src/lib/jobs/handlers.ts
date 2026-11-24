import { withSystem, type TenantContext } from "@/lib/db";
import type { JobRow } from "@/lib/jobs/queue";
import { processDocument } from "@/lib/rag/ingest";
import { executeAgentRun } from "@/lib/agents/runner";
import { advanceOrchestration, planOrchestration } from "@/lib/orchestrator/engine";
import { advanceWorkflow } from "@/lib/workflows/engine";
import { executeCodeTask } from "@/lib/code/runner";

/**
 * Bepaalt namens welke gebruiker een job draait. Agent-, orchestratie- en workflowjobs
 * draaien altijd met de rechten van de gebruiker die de opdracht startte – ook als een
 * beheerder later een goedkeuring gaf.
 */
async function contextFor(job: JobRow): Promise<TenantContext> {
  if (!job.org_id) throw new Error("Job zonder organisatie");
  const p = job.payload as Record<string, string>;
  let userId = job.created_by;
  await withSystem(async (tx) => {
    if ((job.type === "agent.run" || job.type === "agent.resume") && p.runId) {
      const [r] = await tx<{ created_by: string | null }[]>`select created_by from agent_runs where id = ${p.runId} and org_id = ${job.org_id}`;
      userId = r?.created_by ?? userId;
    } else if (job.type.startsWith("orchestration.") && p.orchestrationId) {
      const [r] = await tx<{ created_by: string | null }[]>`select created_by from orchestrations where id = ${p.orchestrationId} and org_id = ${job.org_id}`;
      userId = r?.created_by ?? userId;
    } else if (job.type === "code.run" && p.taskId) {
      const [r] = await tx<{ created_by: string | null }[]>`select created_by from code_tasks where id = ${p.taskId} and org_id = ${job.org_id}`;
      userId = r?.created_by ?? userId;
    } else if (job.type === "workflow.advance" && p.runId) {
      const [r] = await tx<{ created_by: string | null }[]>`select created_by from workflow_runs where id = ${p.runId} and org_id = ${job.org_id}`;
      userId = r?.created_by ?? userId;
    }
  });
  if (!userId) throw new Error("Job zonder gebruiker");
  return { orgId: job.org_id, userId };
}

export async function handleJob(job: JobRow): Promise<unknown> {
  const p = job.payload as Record<string, string>;
  if (job.type === "retention.purge") return purgeExpiredData();
  const ctx = await contextFor(job);
  switch (job.type) {
    case "document.ingest":
      return processDocument(ctx, p.documentId);
    case "agent.run":
    case "agent.resume":
      return executeAgentRun(ctx, p.runId);
    case "orchestration.plan":
      return planOrchestration(ctx, p.orchestrationId);
    case "orchestration.advance":
      return advanceOrchestration(ctx, p.orchestrationId);
    case "workflow.advance":
      return advanceWorkflow(ctx, p.runId);
    case "code.run":
      return executeCodeTask(ctx, p.taskId);
    default:
      throw new Error(`Onbekend jobtype: ${job.type}`);
  }
}

/** AVG: verwijdert gegevens ouder dan de bewaartermijn van elke organisatie. */
export async function purgeExpiredData() {
  return withSystem(async (tx) => {
    const res: Record<string, number> = {};
    const run = async (name: string, q: PromiseLike<{ length: number }>) => (res[name] = (await q).length);
    await run("conversations", tx`delete from conversations c using organizations o where c.org_id = o.id and c.updated_at < now() - make_interval(days => o.retention_days) returning c.id`);
    await run("tool_executions", tx`delete from tool_executions t using organizations o where t.org_id = o.id and t.created_at < now() - make_interval(days => o.retention_days) returning t.id`);
    await run("agent_runs", tx`delete from agent_runs r using organizations o where r.org_id = o.id and r.finished_at is not null and r.finished_at < now() - make_interval(days => o.retention_days) returning r.id`);
    await run("app_runs", tx`delete from app_runs r using organizations o where r.org_id = o.id and r.created_at < now() - make_interval(days => o.retention_days) returning r.id`);
    await run("prompt_test_runs", tx`delete from prompt_test_runs r using organizations o where r.org_id = o.id and r.created_at < now() - make_interval(days => o.retention_days) returning r.id`);
    await run("approvals_expired", tx`update approval_requests set status = 'expired' where status = 'pending' and expires_at < now() returning id`);
    await run("sessions", tx`delete from sessions where expires_at < now() returning id`);
    await run("jobs", tx`delete from jobs where finished_at < now() - interval '30 days' returning id`);
    await run("rate_limits", tx`delete from rate_limits where window_start < now() - interval '1 day' returning key`);
    return res;
  });
}
