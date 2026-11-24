import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { withTenant } from "@/lib/db";
import { resolveModel } from "@/lib/ai/service";

export const GET = orgHandler({ permission: "chat.use" }, async ({ ctx }) => {
  const conversations = await withTenant(ctx.tenant, (tx) => tx`
    select id, title, provider, model_id, total_cost_usd, total_input_tokens + total_output_tokens as tokens, updated_at
      from conversations where kind = 'studio' order by pinned desc, updated_at desc limit 100`);
  return { conversations };
});

const createConversationSchema = z.object({
  provider: z.string().min(1).max(30),
  modelId: z.string().min(1).max(120),
  systemPrompt: z.string().max(40_000).default(""),
  promptId: z.string().uuid().nullable().optional(),
  promptVersion: z.number().int().positive().nullable().optional(),
  toolKeys: z.array(z.string().regex(/^[a-z][a-z0-9_]{1,63}$/)).max(30).default([]),
  knowledgeBaseIds: z.array(z.string().uuid()).max(20).default([]),
  title: z.string().max(200).optional(),
});

export const POST = orgHandler({ permission: "chat.use", rate: { name: "conv-create", limit: 60, windowSec: 60 } }, async ({ req, ctx }) => {
  const input = await parseJson(req, createConversationSchema);
  const conv = await withTenant(ctx.tenant, async (tx) => {
    await resolveModel(tx, input.provider, input.modelId);
    const [row] = await tx`
      insert into conversations (org_id, user_id, title, provider, model_id, system_prompt, prompt_id, prompt_version, tool_keys, knowledge_base_ids)
      values (app_org_id(), app_user_id(), ${input.title ?? "Nieuw gesprek"}, ${input.provider}, ${input.modelId}, ${input.systemPrompt},
              ${input.promptId ?? null}, ${input.promptVersion ?? null}, ${input.toolKeys}, ${input.knowledgeBaseIds})
      returning id, title, provider, model_id, updated_at`;
    return row;
  });
  return { conversation: conv };
});
