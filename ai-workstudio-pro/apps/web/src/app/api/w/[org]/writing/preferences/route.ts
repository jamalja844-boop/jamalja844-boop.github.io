import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { withTenant } from "@/lib/db";
import { getUserPrefs } from "@/lib/writing/service";

/** Persoonlijke instructies: alleen de eigen rij (RLS). */
export const GET = orgHandler({ permission: "writing.use" }, async ({ ctx }) => {
  const preferences = await withTenant(ctx.tenant, (tx) => getUserPrefs(tx));
  return { preferences };
});

const schema = z.object({
  instructions: z.string().max(8000),
  defaultStyleId: z.string().uuid().nullable(),
  defaultLanguage: z.string().trim().min(2).max(40),
});

export const PUT = orgHandler({ permission: "writing.use" }, async ({ req, ctx }) => {
  const input = await parseJson(req, schema);
  await withTenant(ctx.tenant, async (tx) => {
    if (input.defaultStyleId) {
      const [s] = await tx`select id from writing_styles where id = ${input.defaultStyleId}`;
      if (!s) throw notFound("Schrijfstijl");
    }
    await tx`
      insert into user_instructions (org_id, user_id, instructions, default_style_id, default_language)
      values (app_org_id(), app_user_id(), ${input.instructions}, ${input.defaultStyleId}, ${input.defaultLanguage})
      on conflict (org_id, user_id) do update set instructions = excluded.instructions, default_style_id = excluded.default_style_id,
        default_language = excluded.default_language, updated_at = now()`;
  });
  return { ok: true };
});
