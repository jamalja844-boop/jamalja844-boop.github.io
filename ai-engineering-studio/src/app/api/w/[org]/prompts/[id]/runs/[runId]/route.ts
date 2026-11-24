import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { withTenant } from "@/lib/db";

export const PATCH = orgHandler<{ org: string; id: string; runId: string }>({ permission: "prompts.manage" }, async ({ req, ctx, params }) => {
  const runId = z.string().uuid().parse(params.runId);
  const { rating } = await parseJson(req, z.object({ rating: z.number().int().min(1).max(5) }));
  await withTenant(ctx.tenant, (tx) => tx`update prompt_test_runs set rating = ${rating} where id = ${runId}`);
  return { ok: true };
});
