import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/security/audit";
import { APP_TYPES, type AppConfig, type AppType } from "@/lib/apps/presets";
import { slugify } from "@/lib/orgs/service";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  appType: z.enum(Object.keys(APP_TYPES) as [AppType, ...AppType[]]),
  provider: z.string().max(30),
  modelId: z.string().max(120),
});

export const POST = orgHandler({ permission: "apps.manage" }, async ({ req, ctx }) => {
  const input = await parseJson(req, schema);
  const preset = APP_TYPES[input.appType].preset;
  const config: AppConfig = { ...preset, provider: input.provider, modelId: input.modelId, promptId: null, knowledgeBaseIds: [] };
  const [row] = await withTenant(ctx.tenant, async (tx) => {
    const kbs = input.appType === "customer_service" || input.appType === "internal_assistant" || input.appType === "quote_generator"
      ? await tx<{ id: string }[]>`select id from knowledge_bases order by created_at limit 1` : [];
    config.knowledgeBaseIds = kbs.map((k) => k.id);
    const base = slugify(input.name).slice(0, 50) || "app";
    const [taken] = await tx<{ n: number }[]>`select count(*)::int as n from ai_apps where slug like ${base + "%"}`;
    const r = await tx<{ id: string }[]>`
      insert into ai_apps (org_id, name, slug, app_type, description, config, created_by)
      values (app_org_id(), ${input.name}, ${taken.n ? `${base}-${taken.n + 1}` : base}, ${input.appType}, ${APP_TYPES[input.appType].description},
              ${tx.json(config as never)}, app_user_id())
      returning id`;
    await audit(tx, { action: "app.created", targetType: "app", targetId: r[0].id, metadata: { type: input.appType } });
    return r;
  });
  return { id: row.id };
});
