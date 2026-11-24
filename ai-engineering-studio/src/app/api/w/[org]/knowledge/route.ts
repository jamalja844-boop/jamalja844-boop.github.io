import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/security/audit";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().max(1000).default(""),
  minRole: z.enum(["owner", "admin", "developer", "member", "viewer"]).default("viewer"),
  chunkSize: z.number().int().min(200).max(8000).default(1200),
  chunkOverlap: z.number().int().min(0).max(2000).default(150),
});

export const POST = orgHandler({ permission: "knowledge.manage" }, async ({ req, ctx }) => {
  const input = await parseJson(req, schema);
  const [row] = await withTenant(ctx.tenant, async (tx) => {
    const r = await tx<{ id: string }[]>`
      insert into knowledge_bases (org_id, name, description, min_role, chunk_size, chunk_overlap, created_by)
      values (app_org_id(), ${input.name}, ${input.description}, ${input.minRole}, ${input.chunkSize}, ${input.chunkOverlap}, app_user_id())
      returning id`;
    await audit(tx, { action: "knowledge_base.created", targetType: "knowledge_base", targetId: r[0].id, metadata: { name: input.name } });
    return r;
  });
  return { id: row.id };
});
