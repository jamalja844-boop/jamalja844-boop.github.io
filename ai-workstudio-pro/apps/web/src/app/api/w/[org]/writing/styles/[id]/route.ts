import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { ApiError, notFound } from "@/lib/api/errors";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/security/audit";

type P = { org: string; id: string };

const schema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(300).optional(),
  instructions: z.string().trim().min(10).max(8000).optional(),
  isDefault: z.boolean().optional(),
});

export const PATCH = orgHandler<P>({ permission: "styles.manage" }, async ({ req, ctx, params }) => {
  const styleId = z.string().uuid().parse(params.id);
  const input = await parseJson(req, schema);
  await withTenant(ctx.tenant, async (tx) => {
    if (input.isDefault) await tx`update writing_styles set is_default = false where is_default and id <> ${styleId}`;
    const [row] = await tx`
      update writing_styles set name = coalesce(${input.name ?? null}, name), description = coalesce(${input.description ?? null}, description),
        instructions = coalesce(${input.instructions ?? null}, instructions), is_default = coalesce(${input.isDefault ?? null}, is_default)
      where id = ${styleId} returning id`;
    if (!row) throw notFound("Schrijfstijl");
    await audit(tx, { action: "writing.style_updated", targetType: "writing_style", targetId: styleId });
  });
  return { ok: true };
});

export const DELETE = orgHandler<P>({ permission: "styles.manage" }, async ({ ctx, params }) => {
  const styleId = z.string().uuid().parse(params.id);
  await withTenant(ctx.tenant, async (tx) => {
    const [s] = await tx<{ is_default: boolean }[]>`select is_default from writing_styles where id = ${styleId}`;
    if (!s) throw notFound("Schrijfstijl");
    if (s.is_default) throw new ApiError(409, "De standaardstijl kan niet worden verwijderd. Maak eerst een andere stijl standaard.");
    await tx`delete from writing_styles where id = ${styleId}`;
    await audit(tx, { action: "writing.style_deleted", targetType: "writing_style", targetId: styleId });
  });
  return { ok: true };
});
