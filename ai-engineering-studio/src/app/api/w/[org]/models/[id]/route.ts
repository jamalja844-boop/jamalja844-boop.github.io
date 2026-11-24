import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/security/audit";

const schema = z.object({
  isEnabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  displayName: z.string().trim().min(1).max(120).optional(),
  inputPrice: z.number().min(0).max(10_000).nullable().optional(),
  outputPrice: z.number().min(0).max(10_000).nullable().optional(),
});

export const PATCH = orgHandler<{ org: string; id: string }>({ permission: "models.manage" }, async ({ req, ctx, params }) => {
  const id = z.string().uuid().parse(params.id);
  const input = await parseJson(req, schema);
  return withTenant(ctx.tenant, async (tx) => {
    const [m] = await tx<{ kind: string }[]>`select kind from ai_models where id = ${id}`;
    if (!m) throw notFound("Model");
    if (input.isDefault) await tx`update ai_models set is_default = false where kind = ${m.kind}`;
    const [row] = await tx`
      update ai_models set
        is_enabled = coalesce(${input.isEnabled ?? null}, is_enabled),
        is_default = coalesce(${input.isDefault ?? null}, is_default),
        display_name = coalesce(${input.displayName ?? null}, display_name),
        input_price = case when ${input.inputPrice !== undefined} then ${input.inputPrice ?? null}::numeric else input_price end,
        output_price = case when ${input.outputPrice !== undefined} then ${input.outputPrice ?? null}::numeric else output_price end
      where id = ${id} returning id, is_enabled, is_default, input_price, output_price`;
    await audit(tx, { action: "model.updated", targetType: "model", targetId: id, metadata: input });
    return { model: row };
  });
});
