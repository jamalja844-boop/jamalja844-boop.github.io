import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { withTenant } from "@/lib/db";
import { resolveModel } from "@/lib/ai/service";
import { audit } from "@/lib/security/audit";
import { createOrchestration } from "@/lib/orchestrator/engine";

const schema = z.object({
  goal: z.string().trim().min(5).max(10_000),
  title: z.string().trim().max(200).optional(),
  provider: z.string().max(30),
  modelId: z.string().max(120),
  maxCostUsd: z.number().min(0.05).max(200).default(2),
});

export const POST = orgHandler({ permission: "agents.run", rate: { name: "orchestration", limit: 10, windowSec: 60 } }, async ({ req, ctx }) => {
  const input = await parseJson(req, schema);
  await withTenant(ctx.tenant, (tx) => resolveModel(tx, input.provider, input.modelId));
  const id = await createOrchestration(ctx.tenant, input);
  await withTenant(ctx.tenant, (tx) => audit(tx, { action: "orchestration.started", targetType: "orchestration", targetId: id, metadata: { goal: input.goal.slice(0, 200) } }));
  return { id };
});
