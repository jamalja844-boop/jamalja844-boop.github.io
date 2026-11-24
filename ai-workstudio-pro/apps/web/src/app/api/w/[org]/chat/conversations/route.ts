import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { withTenant } from "@/lib/db";
import { defaultChatModel, resolveModel } from "@/lib/ai/service";
import { getUserPrefs } from "@/lib/writing/service";

export const GET = orgHandler({ permission: "chat.use" }, async ({ req, ctx }) => {
  const q = req.nextUrl.searchParams.get("q")?.trim().slice(0, 100) ?? "";
  const conversations = await withTenant(ctx.tenant, (tx) => tx`
    select c.id, c.title, c.provider, c.model_id, c.style_id, c.project_id, c.pinned, c.updated_at, p.name as project_name
      from conversations c left join code_projects p on p.id = c.project_id
     where c.kind = 'chat' and c.user_id = app_user_id()
       and (${q} = '' or c.title ilike ${"%" + q.replace(/[%_\\]/g, "\\$&") + "%"})
     order by c.pinned desc, c.updated_at desc limit 200`);
  return { conversations };
});

const schema = z.object({
  title: z.string().trim().max(200).optional(),
  provider: z.string().max(30).optional(),
  modelId: z.string().max(120).optional(),
  styleId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
});

export const POST = orgHandler({ permission: "chat.use", rate: { name: "chat-create", limit: 60, windowSec: 60 } }, async ({ req, ctx }) => {
  const input = await parseJson(req, schema);
  const conversation = await withTenant(ctx.tenant, async (tx) => {
    let model = input.provider && input.modelId ? { provider: input.provider, modelId: input.modelId } : await defaultChatModel(tx);
    if (!model) throw new ApiError(424, "Er is nog geen AI-model beschikbaar. Koppel een AI-provider onder Instellingen → AI-providers.", { setup: { provider: "anthropic", where: "settings/providers" } });
    const resolved = await resolveModel(tx, model.provider, model.modelId);
    model = { provider: resolved.provider, modelId: resolved.modelId };
    const prefs = await getUserPrefs(tx);
    const styleId = input.styleId !== undefined ? input.styleId : prefs.default_style_id;
    const [row] = await tx`
      insert into conversations (org_id, user_id, kind, title, provider, model_id, style_id, project_id)
      values (app_org_id(), app_user_id(), 'chat', ${input.title || "Nieuw gesprek"}, ${model.provider}, ${model.modelId}, ${styleId ?? null}, ${input.projectId ?? null})
      returning id, title, provider, model_id, style_id, project_id, pinned, updated_at`;
    return row;
  });
  return { conversation };
});
