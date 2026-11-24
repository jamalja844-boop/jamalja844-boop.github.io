import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { ApiError, notFound } from "@/lib/api/errors";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/security/audit";
import { validateGraph, type Graph } from "@/lib/workflows/engine";

type P = { org: string; id: string };

const nodeSchema = z.object({
  id: z.string().min(1).max(60),
  type: z.enum(["start", "agent", "llm", "tool", "check", "approval", "output"]),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.record(z.string(), z.unknown()),
});
const edgeSchema = z.object({ id: z.string().min(1).max(120), source: z.string(), target: z.string(), sourceHandle: z.string().nullable().optional() });
const schema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  graph: z.object({ nodes: z.array(nodeSchema).max(60), edges: z.array(edgeSchema).max(200) }).optional(),
});

export const PUT = orgHandler<P>({ permission: "workflows.manage" }, async ({ req, ctx, params }) => {
  const id = z.string().uuid().parse(params.id);
  const input = await parseJson(req, schema, 500_000);
  if (input.graph) {
    const errors = validateGraph(input.graph as Graph);
    if (errors.length && input.status === "active") throw new ApiError(400, errors.join("; "));
  }
  const graph = input.graph ? (input.graph as Graph) : null;
  return withTenant(ctx.tenant, async (tx) => {
    const [row] = await tx`
      update workflows set name = coalesce(${input.name ?? null}, name), description = coalesce(${input.description ?? null}, description),
        status = coalesce(${input.status ?? null}, status),
        graph = case when ${graph !== null} then ${tx.json((graph ?? {}) as never)} else graph end,
        version = version + case when ${graph !== null} then 1 else 0 end
      where id = ${id} returning id, version, status`;
    if (!row) throw notFound("Workflow");
    await audit(tx, { action: "workflow.updated", targetType: "workflow", targetId: id, metadata: { version: row.version, status: row.status } });
    return { workflow: row, warnings: graph ? validateGraph(graph) : [] };
  });
});

export const DELETE = orgHandler<P>({ permission: "workflows.manage" }, async ({ ctx, params }) => {
  const id = z.string().uuid().parse(params.id);
  await withTenant(ctx.tenant, async (tx) => {
    const [w] = await tx`delete from workflows where id = ${id} returning name`;
    if (!w) throw notFound("Workflow");
    await audit(tx, { action: "workflow.deleted", targetType: "workflow", targetId: id, metadata: { name: w.name } });
  });
  return { ok: true };
});
