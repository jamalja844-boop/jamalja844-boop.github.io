import { withTenant, type TenantContext } from "@/lib/db";
import type { OrgRole } from "@/lib/auth/rbac";
import { ApiError } from "@/lib/api/errors";
import { audit } from "@/lib/security/audit";
import { enqueue } from "@/lib/jobs/queue";
import { executeApproved, type ExecuteResult, type ToolActor } from "@/lib/tools/executor";
import { loadAgentPolicy } from "@/lib/agents/policy";

/**
 * Besluit over een goedkeuringsverzoek. Bij goedkeuring van een tooluitvoering wordt de
 * actie direct uitgevoerd; gekoppelde agentruns en workflows worden daarna hervat.
 */
export async function decideApproval(ctx: TenantContext, role: OrgRole, approvalId: string, approve: boolean, note?: string) {
  const approval = await withTenant(ctx, async (tx) => {
    const [a] = await tx<{ id: string; kind: string; status: string; expires_at: Date; tool_execution_id: string | null; agent_run_id: string | null; workflow_run_id: string | null; requested_by_agent_id: string | null }[]>`
      select id, kind, status, expires_at, tool_execution_id, agent_run_id, workflow_run_id, requested_by_agent_id
        from approval_requests where id = ${approvalId} for update`;
    if (!a) throw new ApiError(404, "Goedkeuringsverzoek niet gevonden");
    if (a.status !== "pending") throw new ApiError(409, "Over dit verzoek is al besloten");
    if (a.expires_at < new Date()) {
      await tx`update approval_requests set status = 'expired' where id = ${approvalId}`;
      throw new ApiError(410, "Dit verzoek is verlopen");
    }
    await tx`update approval_requests set status = ${approve ? "approved" : "rejected"}, decided_by = app_user_id(), decided_at = now(),
               decision_note = ${note ?? null} where id = ${approvalId}`;
    if (!approve && a.tool_execution_id) {
      await tx`update tool_executions set status = 'rejected', error = ${`Afgewezen door beheerder${note ? `: ${note}` : ""}`}, finished_at = now()
               where id = ${a.tool_execution_id}`;
    }
    await audit(tx, { action: approve ? "approval.approved" : "approval.rejected", targetType: "approval", targetId: approvalId, metadata: { note } });
    return a;
  });

  let execution: ExecuteResult | null = null;
  if (approve && approval.tool_execution_id) {
    const [exec] = await withTenant(ctx, (tx) => tx<{ actor_type: ToolActor["type"]; actor_id: string | null; conversation_id: string | null }[]>`
      select actor_type, actor_id, conversation_id from tool_executions where id = ${approval.tool_execution_id}`);
    let actor: ToolActor;
    if (exec.actor_type === "agent" && exec.actor_id) {
      const policy = await loadAgentPolicy(ctx, exec.actor_id);
      if (!policy) throw new ApiError(404, "Agent bestaat niet meer");
      actor = { type: "agent", id: policy.id, agent: policy };
    } else {
      actor = { type: exec.actor_type as "chat" | "user" | "app" | "workflow", id: exec.actor_id };
    }
    execution = await executeApproved(ctx, approval.tool_execution_id, role, actor);
  }

  // Hervat de wachtende agentrun of workflow via de job-queue.
  await withTenant(ctx, async (tx) => {
    if (approval.agent_run_id) await enqueue(tx, "agent.resume", { runId: approval.agent_run_id }, { priority: 5 });
    if (approval.workflow_run_id && !approval.agent_run_id) await enqueue(tx, "workflow.advance", { runId: approval.workflow_run_id }, { priority: 5 });
  });

  return { status: approve ? "approved" : "rejected", execution };
}
