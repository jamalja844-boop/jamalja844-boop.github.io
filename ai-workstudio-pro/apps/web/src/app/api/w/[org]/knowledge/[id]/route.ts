import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/security/audit";

type P = { org: string; id: string };

export const PATCH = orgHandler<P>({ permission: "knowledge.manage" }, async ({ req, ctx, params }) => {
  const id = z.string().uuid().parse(params.id);
  const input = await parseJson(req, z.object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().max(1000).optional(),
    minRole: z.enum(["owner", "admin", "developer", "member", "viewer"]).optional(),
  }));
  const [row] = await withTenant(ctx.tenant, (tx) => tx`
    update knowledge_bases set name = coalesce(${input.name ?? null}, name), description = coalesce(${input.description ?? null}, description),
      min_role = coalesce(${input.minRole ?? null}::org_role, min_role)
    where id = ${id} returning id`);
  if (!row) throw notFound("Kennisbank");
  return { ok: true };
});

export const DELETE = orgHandler<P>({ permission: "knowledge.manage" }, async ({ ctx, params }) => {
  const id = z.string().uuid().parse(params.id);
  await withTenant(ctx.tenant, async (tx) => {
    const [r] = await tx`delete from knowledge_bases where id = ${id} returning name`;
    if (!r) throw notFound("Kennisbank");
    await audit(tx, { action: "knowledge_base.deleted", targetType: "knowledge_base", targetId: id, metadata: { name: r.name } });
  });
  return { ok: true };
});
