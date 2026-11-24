import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/security/audit";
import { listStyles } from "@/lib/writing/service";

export const GET = orgHandler({ permission: "writing.use" }, async ({ ctx }) => {
  const styles = await withTenant(ctx.tenant, (tx) => listStyles(tx));
  return { styles };
});

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).default(""),
  instructions: z.string().trim().min(10).max(8000),
  isDefault: z.boolean().default(false),
});

export const POST = orgHandler({ permission: "styles.manage" }, async ({ req, ctx }) => {
  const input = await parseJson(req, schema);
  const id = await withTenant(ctx.tenant, async (tx) => {
    if (input.isDefault) await tx`update writing_styles set is_default = false where is_default`;
    const [row] = await tx<{ id: string }[]>`
      insert into writing_styles (org_id, name, description, instructions, is_default, created_by)
      values (app_org_id(), ${input.name}, ${input.description}, ${input.instructions}, ${input.isDefault}, app_user_id()) returning id`;
    await audit(tx, { action: "writing.style_created", targetType: "writing_style", targetId: row.id, metadata: { name: input.name } });
    return row.id;
  });
  return { id };
});
