import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/security/audit";

const schema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().max(1000).optional(),
  retentionDays: z.number().int().min(7).max(3650).optional(),
  monthlyBudgetUsd: z.number().min(0).max(1_000_000).nullable().optional(),
});

export const PATCH = orgHandler({ permission: "org.manage" }, async ({ req, ctx, ip }) => {
  const input = await parseJson(req, schema);
  await withTenant(ctx.tenant, async (tx) => {
    await tx`update organizations set
               name = coalesce(${input.name ?? null}, name),
               description = coalesce(${input.description ?? null}, description),
               retention_days = coalesce(${input.retentionDays ?? null}, retention_days),
               monthly_budget_usd = case when ${input.monthlyBudgetUsd !== undefined} then ${input.monthlyBudgetUsd ?? null}::numeric else monthly_budget_usd end
             where id = app_org_id()`;
    await audit(tx, { action: "org.updated", targetType: "organization", targetId: ctx.org.id, metadata: input, ip });
  });
  return { ok: true };
});
