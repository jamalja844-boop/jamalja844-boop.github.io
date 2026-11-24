import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { syncProviderModels } from "@/lib/ai/service";
import { ProviderError } from "@/lib/ai/types";
import { withTenant } from "@/lib/db";

/** Haalt de actuele modellijst op bij de provider (GET /v1/models). */
export const POST = orgHandler({ permission: "models.manage", rate: { name: "model-sync", limit: 10, windowSec: 300 } }, async ({ req, ctx }) => {
  const { provider } = await parseJson(req, z.object({ provider: z.enum(["anthropic", "openai", "demo"]) }));
  try {
    const count = await syncProviderModels(ctx.tenant, provider);
    return { count };
  } catch (err) {
    if (err instanceof ProviderError) {
      if (provider !== "demo") {
        await withTenant(ctx.tenant, (tx) => tx`update credentials set status = 'invalid', last_error = ${err.message} where kind = 'llm' and provider = ${provider}`);
      }
      throw new ApiError(502, err.message);
    }
    throw err;
  }
});
