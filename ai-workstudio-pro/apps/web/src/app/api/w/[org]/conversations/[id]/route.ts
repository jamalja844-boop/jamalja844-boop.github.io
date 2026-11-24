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
      select id, title, provider, model_id, system_prompt, prompt_id, prompt_version, tool_keys, knowledge_base_ids,
             total_input_tokens, total_output_tokens, total_cost_usd, created_at, updated_at
        from conversations where id = ${convId}`;
    if (!conversation) throw notFound("Gesprek");
    const messages = await tx`
      select id, role, content, tool_calls, tool_call_id, tool_name, is_error, citations, metadata, provider, model_id,
             input_tokens, output_tokens, cost_usd, created_at
        from messages where conversation_id = ${convId} order by created_at`;
    const pending = await tx`
      select a.id, a.title, a.status, e.tool_call_id from approval_requests a join tool_executions e on e.id = a.tool_execution_id
       where a.conversation_id = ${convId} and a.status = 'pending'`;
    return { conversation, messages, pendingApprovals: pending };
  });
});

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  provider: z.string().max(30).optional(),
  modelId: z.string().max(120).optional(),
  systemPrompt: z.string().max(40_000).optional(),
  toolKeys: z.array(z.string().regex(/^[a-z][a-z0-9_]{1,63}$/)).max(30).optional(),
  knowledgeBaseIds: z.array(z.string().uuid()).max(20).optional(),
  promptId: z.string().uuid().nullable().optional(),
  promptVersion: z.number().int().positive().nullable().optional(),
  pinned: z.boolean().optional(),
});

export const PATCH = orgHandler<P>({ permission: "chat.use" }, async ({ req, ctx, params }) => {
  const convId = id.parse(params.id);
  const input = await parseJson(req, patchSchema);
  return withTenant(ctx.tenant, async (tx) => {
    if (input.provider && input.modelId) await resolveModel(tx, input.provider, input.modelId);
    const [row] = await tx`
      update conversations set
        title = coalesce(${input.title ?? null}, title),
        provider = coalesce(${input.provider ?? null}, provider),
        model_id = coalesce(${input.modelId ?? null}, model_id),
        system_prompt = coalesce(${input.systemPrompt ?? null}, system_prompt),
        tool_keys = coalesce(${input.toolKeys ?? null}::text[], tool_keys),
        knowledge_base_ids = coalesce(${input.knowledgeBaseIds ?? null}::uuid[], knowledge_base_ids),
        prompt_id = case when ${input.promptId !== undefined} then ${input.promptId ?? null}::uuid else prompt_id end,
        prompt_version = case when ${input.promptVersion !== undefined} then ${input.promptVersion ?? null}::int else prompt_version end,
        pinned = coalesce(${input.pinned ?? null}, pinned)
      where id = ${convId}
      returning id, title, provider, model_id, system_prompt, tool_keys, knowledge_base_ids, prompt_id, prompt_version`;
    if (!row) throw notFound("Gesprek");
    return { conversation: row };
  });
});

export const DELETE = orgHandler<P>({ permission: "chat.use" }, async ({ ctx, params }) => {
  const convId = id.parse(params.id);
  await withTenant(ctx.tenant, (tx) => tx`delete from conversations where id = ${convId}`);
  return { ok: true };
});
