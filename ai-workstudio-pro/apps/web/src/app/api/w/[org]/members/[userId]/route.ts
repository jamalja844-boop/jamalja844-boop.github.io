import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { withTenant, type Tx } from "@/lib/db";
import { audit } from "@/lib/security/audit";

type P = { org: string; userId: string };

async function ownerGuard(tx: Tx, userId: string) {
  const [m] = await tx<{ role: string }[]>`select role from memberships where org_id = app_org_id() and user_id = ${userId}`;
  if (!m) throw new ApiError(404, "Lid niet gevonden");
  if (m.role === "owner") {
    const [o] = await tx<{ n: number }[]>`select count(*)::int as n from memberships where org_id = app_org_id() and role = 'owner'`;
    if (o.n <= 1) throw new ApiError(400, "De laatste eigenaar kan niet worden gewijzigd of verwijderd.");
  }
  return m;
}

export const PATCH = orgHandler<P>({ permission: "members.manage" }, async ({ req, ctx, params, ip }) => {
  const userId = z.string().uuid().parse(params.userId);
  const { role } = await parseJson(req, z.object({ role: z.enum(["owner", "admin", "developer", "member", "viewer"]) }));
  if (role === "owner" && ctx.role !== "owner") throw new ApiError(403, "Alleen een eigenaar kan eigenaarschap toekennen.");
  await withTenant(ctx.tenant, async (tx) => {
    const m = await ownerGuard(tx, userId);
    if (m.role === "owner" && ctx.role !== "owner") throw new ApiError(403, "Alleen een eigenaar kan een eigenaar wijzigen.");
    await tx`update memberships set role = ${role} where org_id = app_org_id() and user_id = ${userId}`;
    await audit(tx, { action: "member.role_changed", targetType: "user", targetId: userId, metadata: { from: m.role, to: role }, ip });
  });
  return { ok: true };
});

export const DELETE = orgHandler<P>({ permission: "members.manage" }, async ({ ctx, params, ip }) => {
  const userId = z.string().uuid().parse(params.userId);
  await withTenant(ctx.tenant, async (tx) => {
    const m = await ownerGuard(tx, userId);
    if (m.role === "owner" && ctx.role !== "owner") throw new ApiError(403, "Alleen een eigenaar kan een eigenaar verwijderen.");
    await tx`delete from memberships where org_id = app_org_id() and user_id = ${userId}`;
    await audit(tx, { action: "member.removed", targetType: "user", targetId: userId, ip });
  });
  return { ok: true };
});
