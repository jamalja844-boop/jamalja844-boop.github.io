import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { runApp } from "@/lib/apps/runner";

export const maxDuration = 300;

export const POST = orgHandler<{ org: string; id: string }>(
  { permission: "apps.use", rate: { name: "app-run", limit: 30, windowSec: 60 } },
  async ({ req, ctx, params }) => {
    const id = z.string().uuid().parse(params.id);
    const { input } = await parseJson(req, z.object({ input: z.record(z.string(), z.string().max(60_000)) }), 400_000);
    return runApp(ctx.tenant, ctx.role, id, input, { allowDraft: ctx.can("apps.manage") });
  },
);
