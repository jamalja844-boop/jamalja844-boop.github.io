import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { withTenant } from "@/lib/db";
import { executeTool } from "@/lib/tools/executor";

/** Handmatig een tool testen vanuit de Tool Manager (zelfde rechten- en goedkeuringsregels). */
export const POST = orgHandler<{ org: string; id: string }>(
  { permission: "tools.execute", rate: { name: "tool-exec", limit: 30, windowSec: 60 } },
  async ({ req, ctx, params }) => {
    const id = z.string().uuid().parse(params.id);
    const { input } = await parseJson(req, z.object({ input: z.record(z.string(), z.unknown()).default({}) }), 200_000);
    const [tool] = await withTenant(ctx.tenant, (tx) => tx<{ key: string }[]>`select key from tools where id = ${id}`);
    if (!tool) throw notFound("Tool");
    const result = await executeTool({ ctx: ctx.tenant, role: ctx.role, toolKey: tool.key, input, actor: { type: "user", id: ctx.user.id } });
    return result;
  },
);
