import { z } from "zod";
import { orgHandler } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/security/audit";
import { loadOrchestration } from "@/lib/orchestrator/queries";

type P = { org: string; id: string };

export const GET = orgHandler<P>({ permission: "agents.view" }, async ({ ctx, params }) => {
  const id = z.string().uuid().parse(params.id);
  const data = await withTenant(ctx.tenant, (tx) => loadOrchestration(tx, id));
  if (!data) throw notFound("Orchestratie");
  return data;
});

/** Annuleren: openstaande taken stoppen. */
export const DELETE = orgHandler<P>({ permission: "agents.run" }, async ({ ctx, params }) => {
  const id = z.string().uuid().parse(params.id);
  await withTenant(ctx.tenant, async (tx) => {
    await tx`update orchestrations set status = 'cancelled', finished_at = now() where id = ${id} and status not in ('completed','failed','cancelled')`;
    await tx`update agent_tasks set status = 'cancelled', finished_at = now() where orchestration_id = ${id} and status in ('blocked','queued','waiting_approval')`;
    await tx`update agent_runs set status = 'cancelled', finished_at = now() where task_id in (select id from agent_tasks where orchestration_id = ${id}) and status in ('queued','waiting_approval')`;
    await audit(tx, { action: "orchestration.cancelled", targetType: "orchestration", targetId: id });
  });
  return { ok: true };
});
