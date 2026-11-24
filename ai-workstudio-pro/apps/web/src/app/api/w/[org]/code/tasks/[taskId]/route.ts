import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { ApiError, notFound } from "@/lib/api/errors";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/security/audit";
import { decideApproval } from "@/lib/approvals/service";

type P = { org: string; taskId: string };

export const GET = orgHandler<P>({ permission: "code.use" }, async ({ ctx, params }) => {
  const taskId = z.string().uuid().parse(params.taskId);
  return withTenant(ctx.tenant, async (tx) => {
    const [task] = await tx`
      select t.id, t.project_id, t.conversation_id, t.prompt, t.status, t.provider, t.model_id, t.plan, t.summary, t.changed_files, t.diff,
             t.error, t.max_steps, t.iterations, t.input_tokens, t.output_tokens, t.cost_usd, t.created_at, t.started_at, t.finished_at,
             t.created_by = app_user_id() as mine, p.name as project_name
        from code_tasks t join code_projects p on p.id = t.project_id where t.id = ${taskId}`;
    if (!task) throw notFound("Taak");
    const steps = await tx`select id, step_index, kind, title, detail, data, status, created_at from code_task_steps where task_id = ${taskId} order by id`;
    const [approval] = await tx`
      select a.id, a.title, a.summary, a.status from approval_requests a
       where a.code_task_id = ${taskId} and a.status = 'pending' order by a.created_at desc limit 1`;
    return { task, steps, approval: approval ?? null };
  });
});

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("decide"), approvalId: z.string().uuid(), decision: z.enum(["approve", "reject"]) }),
]);

/**
 * Annuleren, of toestemming geven voor een installatiecommando met netwerk.
 * Toestemming mag de gebruiker die de taak startte zelf geven (het is zijn eigen sandbox),
 * of een beheerder met het recht approvals.decide.
 */
export const POST = orgHandler<P>({ permission: "code.use", rate: { name: "code-task-action", limit: 60, windowSec: 60 } }, async ({ req, ctx, params }) => {
  const taskId = z.string().uuid().parse(params.taskId);
  const input = await parseJson(req, schema);
  const [task] = await withTenant(ctx.tenant, (tx) => tx<{ status: string; mine: boolean }[]>`
    select status, created_by = app_user_id() as mine from code_tasks where id = ${taskId}`);
  if (!task) throw notFound("Taak");
  if (!task.mine && !ctx.can("approvals.decide")) throw new ApiError(403, "Alleen de starter van de taak of een beheerder kan dit doen");

  if (input.action === "cancel") {
    if (["succeeded", "failed", "cancelled", "limit_reached"].includes(task.status)) throw new ApiError(409, "Deze taak is al afgerond");
    await withTenant(ctx.tenant, async (tx) => {
      await tx`update code_tasks set status = 'cancelled', error = 'Geannuleerd door de gebruiker', finished_at = now() where id = ${taskId}`;
      await tx`update approval_requests set status = 'rejected', decided_by = app_user_id(), decided_at = now(), decision_note = 'Taak geannuleerd'
               where code_task_id = ${taskId} and status = 'pending'`;
      await audit(tx, { action: "code.task_cancelled", targetType: "code_task", targetId: taskId });
    });
    return { status: "cancelled" };
  }

  const [a] = await withTenant(ctx.tenant, (tx) => tx`select id from approval_requests where id = ${input.approvalId} and code_task_id = ${taskId} and kind = 'code_command'`);
  if (!a) throw notFound("Toestemmingsverzoek");
  const r = await decideApproval(ctx.tenant, ctx.role, input.approvalId, input.decision === "approve");
  return { status: r.status };
});
