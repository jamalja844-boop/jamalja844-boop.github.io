import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { startWorkflowRun } from "@/lib/workflows/engine";

export const POST = orgHandler<{ org: string; id: string }>(
  { permission: "workflows.run", rate: { name: "workflow-run", limit: 20, windowSec: 60 } },
  async ({ req, ctx, params }) => {
    const id = z.string().uuid().parse(params.id);
    const { input } = await parseJson(req, z.object({ input: z.record(z.string(), z.string().max(20_000)).default({}) }), 200_000);
    try {
      return { runId: await startWorkflowRun(ctx.tenant, id, input) };
    } catch (e) {
      throw new ApiError(400, e instanceof Error ? e.message : "Starten mislukt");
    }
  },
);
