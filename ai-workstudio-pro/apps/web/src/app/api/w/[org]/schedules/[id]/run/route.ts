import { z } from "zod";
import { orgHandler } from "@/lib/api/handler";
import { queueManualRun } from "@/lib/cowork/scheduler";

/** "Nu uitvoeren": de taak gaat direct in de wachtrij van de worker. */
export const POST = orgHandler<{ org: string; id: string }>(
  { permission: "cowork.use", rate: { name: "schedule-run", limit: 20, windowSec: 600 } },
  async ({ ctx, params }) => {
    const id = z.string().uuid().parse(params.id);
    return { runId: await queueManualRun(ctx.tenant, id) };
  },
);
