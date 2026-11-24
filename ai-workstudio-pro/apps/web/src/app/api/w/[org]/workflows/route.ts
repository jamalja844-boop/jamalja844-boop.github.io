import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/security/audit";

const schema = z.object({ name: z.string().trim().min(2).max(120), description: z.string().max(2000).default("") });

const STARTER = {
  nodes: [{ id: "start", type: "start", position: { x: 40, y: 160 }, data: { label: "Nieuwe aanvraag", fields: "omschrijving" } }],
  edges: [],
};

export const POST = orgHandler({ permission: "workflows.manage" }, async ({ req, ctx }) => {
  const input = await parseJson(req, schema);
  const [row] = await withTenant(ctx.tenant, async (tx) => {
    const r = await tx<{ id: string }[]>`
      insert into workflows (org_id, name, description, graph, created_by) values (app_org_id(), ${input.name}, ${input.description}, ${tx.json(STARTER)}, app_user_id())
      returning id`;
    await audit(tx, { action: "workflow.created", targetType: "workflow", targetId: r[0].id, metadata: { name: input.name } });
    return r;
  });
  return { id: row.id };
});
