import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { withTenant } from "@/lib/db";
import { resolveModel } from "@/lib/ai/service";
import { audit } from "@/lib/security/audit";
import { installCleanPack } from "@/lib/templates/clean";

const schema = z.object({ pack: z.literal("clean"), provider: z.string().max(30), modelId: z.string().max(120), companyFacts: z.boolean().default(false) });

/** Installeert het agent-sjabloonpakket (16 AI-medewerkers + offerteworkflow) in deze workspace. */
export const POST = orgHandler({ permission: "agents.manage", rate: { name: "templates", limit: 5, windowSec: 600 } }, async ({ req, ctx }) => {
  const input = await parseJson(req, schema);
  await withTenant(ctx.tenant, (tx) => resolveModel(tx, input.provider, input.modelId));
  const r = await installCleanPack(ctx.tenant, { provider: input.provider, modelId: input.modelId }, { companyFacts: input.companyFacts });
  if (!r.created && r.total) throw new ApiError(409, "Alle agents uit dit pakket bestaan al in deze workspace");
  await withTenant(ctx.tenant, (tx) => audit(tx, { action: "templates.installed", targetType: "pack", targetId: input.pack, metadata: r }));
  return r;
});
