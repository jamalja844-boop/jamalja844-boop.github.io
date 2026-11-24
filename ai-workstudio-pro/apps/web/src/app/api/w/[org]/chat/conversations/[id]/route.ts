import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { withTenant } from "@/lib/db";
import { resolveModel } from "@/lib/ai/service";

type P = { org: string; id: string };
const id = z.string().uuid();

export const GET = orgHandler<P>({ permission: "chat.use" }, async ({ ctx, params }) => {
  const convId = id.parse(params.id);
  return withTenant(ctx.tenant, async (tx) => {
    const [conversation] = await tx`
      select c.id, c.title, c.provider, c.model_id, c.style_id, c.project_id, c.pinned, c.total_input_tokens, c.total_output_tokens,
             c.total_cost_usd, c.created_at, c.updated_at, p.name as project_name
        from conversations c left join code_projects p on p.id = c.project_id
       where c.id = ${convId} and c.kind = 'chat' and c.user_id = app_user_id()`;
    if (!conversation) throw notFound("Gesprek");
    const messages = await tx`
      select id, role, content, tool_calls, tool_call_id, tool_name, is_error, citations, metadata, provider, model_id,
             input_tokens, output_tokens, cost_usd, created_at
        from messages where conversation_id = ${convId} order by created_at`;
    return { conversation, messages };
  });
});

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  provider: z.string().max(30).optional(),
  modelId: z.string().max(120).optional(),
  styleId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  pinned: z.boolean().optional(),
});

export const PATCH = orgHandler<P>({ permission: "chat.use" }, async ({ req, ctx, params }) => {
  const convId = id.parse(params.id);
  const input = await parseJson(req, patchSchema);
  return withTenant(ctx.tenant, async (tx) => {
    if (input.provider && input.modelId) await resolveModel(tx, input.provider, input.modelId);
    if (input.projectId) {
      const [p] = await tx`select id from code_projects where id = ${input.projectId}`;
      if (!p) throw notFound("Project");
    }
    const [row] = await tx`
      update conversations set
        title = coalesce(${input.title ?? null}, title),
        provider = coalesce(${input.provider ?? null}, provider),
        model_id = coalesce(${input.modelId ?? null}, model_id),
        style_id = case when ${input.styleId !== undefined} then ${input.styleId ?? null}::uuid else style_id end,
        project_id = case when ${input.projectId !== undefined} then ${input.projectId ?? null}::uuid else project_id end,
        pinned = coalesce(${input.pinned ?? null}, pinned)
      where id = ${convId} and kind = 'chat' and user_id = app_user_id()
      returning id, title, provider, model_id, style_id, project_id, pinned`;
    if (!row) throw notFound("Gesprek");
    return { conversation: row };
  });
});

export const DELETE = orgHandler<P>({ permission: "chat.use" }, async ({ ctx, params }) => {
  const convId = id.parse(params.id);
  await withTenant(ctx.tenant, (tx) => tx`delete from conversations where id = ${convId} and kind = 'chat' and user_id = app_user_id()`);
  return { ok: true };
});
