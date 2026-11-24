import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/security/audit";
import { createVersion, normalizeVersion, versionSchema } from "@/lib/prompts/service";

export const GET = orgHandler({ permission: "prompts.view" }, async ({ ctx }) => {
  const prompts = await withTenant(ctx.tenant, (tx) => tx`
    select p.id, p.name, p.description, p.tags, p.current_version, p.updated_at,
           (select count(*)::int from prompt_versions v where v.prompt_id = p.id) as versions
      from prompts p order by p.updated_at desc`);
  return { prompts };
});

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().max(1000).default(""),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  version: versionSchema.optional(),
});

export const POST = orgHandler({ permission: "prompts.manage" }, async ({ req, ctx }) => {
  const input = await parseJson(req, createSchema);
  // Eerst valideren, zodat er nooit een prompt zonder geldige versie ontstaat.
  const version = normalizeVersion(input.version ?? versionSchema.parse({}));
  const id = await withTenant(ctx.tenant, async (tx) => {
    const [p] = await tx<{ id: string }[]>`
      insert into prompts (org_id, name, description, tags, current_version, created_by)
      values (app_org_id(), ${input.name}, ${input.description}, ${input.tags}, 0, app_user_id()) returning id`;
    await audit(tx, { action: "prompt.created", targetType: "prompt", targetId: p.id, metadata: { name: input.name } });
    return p.id;
  });
  await createVersion(ctx.tenant, id, version);
  return { id };
});
