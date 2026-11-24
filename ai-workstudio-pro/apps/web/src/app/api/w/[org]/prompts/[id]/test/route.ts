import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { runPromptTest } from "@/lib/prompts/service";

export const maxDuration = 300;

const schema = z.object({
  variants: z.array(z.object({ version: z.number().int().positive(), provider: z.string().max(30), modelId: z.string().max(120) })).min(1).max(4),
  variables: z.record(z.string(), z.string().max(20_000)).default({}),
});

export const POST = orgHandler<{ org: string; id: string }>(
  { permission: "prompts.manage", rate: { name: "prompt-test", limit: 20, windowSec: 60 } },
  async ({ req, ctx, params }) => {
    const id = z.string().uuid().parse(params.id);
    const input = await parseJson(req, schema, 200_000);
    return runPromptTest(ctx.tenant, id, input.variants, input.variables);
  },
);
