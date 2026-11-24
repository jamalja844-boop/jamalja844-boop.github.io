import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/security/audit";

type P = { org: string; id: string };

export const PATCH = orgHandler<P>({ permission: "tools.execute" }, async ({ req, ctx, params }) => {
  const id = z.string().uuid().parse(params.id);
  const input = await parseJson(req, z.object({ title: z.string().trim().min(1).max(200).optional(), status: z.string().max(40).optional(), data: z.record(z.string(), z.unknown()).optional() }));
  const [row] = await withTenant(ctx.tenant, (tx) => tx`
    update records set title = coalesce(${input.title ?? null}, title), status = coalesce(${input.status ?? null}, status),
      data = case when ${input.data !== undefined} then ${tx.json((input.data ?? {}) as never)} else data end
    where id = ${id} returning id`);
  if (!row) throw notFound("Record");
  return { ok: true };
});

/** Verwijderen door een gebruiker vereist beheerrechten (agents moeten via goedkeuring). */
export const DELETE = orgHandler<P>({ permission: "approvals.decide" }, async ({ ctx, params }) => {
  const id = z.string().uuid().parse(params.id);
  await withTenant(ctx.tenant, async (tx) => {
    const [r] = await tx`delete from records where id = ${id} returning collection`;
    if (!r) throw notFound("Record");
    await audit(tx, { action: "record.deleted", targetType: "record", targetId: id, metadata: { collection: r.collection } });
  });
  return { ok: true };
});
