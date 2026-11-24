import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { runProjectCommand } from "@/lib/code/projects";

export const maxDuration = 300;

const schema = z.object({
  command: z.string().trim().min(1).max(2000),
  /** Expliciete toestemming van de gebruiker voor netwerktoegang (alleen voor installatiecommando's). */
  allowNetwork: z.boolean().default(false),
});

/** Terminal: voert één commando uit in de geïsoleerde sandbox van het project. */
export const POST = orgHandler<{ org: string; id: string }>(
  { permission: "code.use", rate: { name: "code-cmd", limit: 30, windowSec: 60 } },
  async ({ req, ctx, params }) => {
    const projectId = z.string().uuid().parse(params.id);
    const input = await parseJson(req, schema);
    const result = await runProjectCommand(ctx.tenant, projectId, input.command, { network: input.allowNetwork });
    return { result };
  },
);
