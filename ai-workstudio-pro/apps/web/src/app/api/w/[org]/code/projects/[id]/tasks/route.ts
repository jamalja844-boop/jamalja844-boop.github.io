import { z } from "zod";
import { startCodeTaskSchema } from "@workstudio/shared";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { startCodeTask } from "@/lib/code/runner";

/** Start een AI Code-taak; de uitvoering gebeurt in de job-worker. */
export const POST = orgHandler<{ org: string; id: string }>(
  { permission: "code.use", rate: { name: "code-task", limit: 20, windowSec: 300 } },
  async ({ req, ctx, params }) => {
    const projectId = z.string().uuid().parse(params.id);
    const input = await parseJson(req, startCodeTaskSchema, 100_000);
    const id = await startCodeTask(ctx.tenant, { projectId, ...input });
    return { id };
  },
);
