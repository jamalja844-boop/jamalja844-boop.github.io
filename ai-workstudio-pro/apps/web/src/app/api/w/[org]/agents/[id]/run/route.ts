import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { startAgentTask } from "@/lib/agents/runner";

const schema = z.object({
  title: z.string().trim().min(2).max(300),
  instructions: z.string().trim().min(2).max(20_000),
  input: z.record(z.string(), z.unknown()).default({}),
});

/** Start een taak voor één agent (uitgevoerd door de job-worker). */
export const POST = orgHandler<{ org: string; id: string }>(
  { permission: "agents.run", rate: { name: "agent-run", limit: 30, windowSec: 60 } },
  async ({ req, ctx, params }) => {
    const agentId = z.string().uuid().parse(params.id);
    const input = await parseJson(req, schema, 200_000);
    try {
      return await startAgentTask(ctx.tenant, { agentId, ...input });
    } catch (e) {
      throw new ApiError(400, e instanceof Error ? e.message : "Starten mislukt");
    }
  },
);
