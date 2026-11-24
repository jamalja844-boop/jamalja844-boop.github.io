import { json, withTenant, type TenantContext } from "@/lib/db";
import type { OrgRole } from "@/lib/auth/rbac";
import { ApiError, ConfigurationError } from "@/lib/api/errors";
import { runChat } from "@/lib/ai/service";
import { ProviderError, type ChatMessage, type ToolCall } from "@/lib/ai/types";
import { buildKnowledgeContext, searchKnowledge, type Citation } from "@/lib/rag/search";
import { UNTRUSTED_DATA_POLICY } from "@/lib/security/injection";
import { executeTool, formatToolResultForModel, loadTools, toolSpecs } from "@/lib/tools/executor";

export type ChatEvent =
  | { type: "user_message"; message: DbMessage }
  | { type: "text"; delta: string }
  | { type: "assistant_message"; message: DbMessage }
  | { type: "tool_started"; toolKey: string; input: unknown; callId: string }
  | { type: "tool_result"; message: DbMessage; status: string; approvalId?: string }
  | { type: "approval_required"; approvalId: string; toolKey: string }
  | { type: "citations"; citations: Citation[] }
  | { type: "error"; error: string; setup?: { provider: string; where: string } | null }
  | { type: "done"; inputTokens: number; outputTokens: number; costUsd: number | null };

export interface DbMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  tool_calls: ToolCall[] | null;
  tool_call_id: string | null;
  tool_name: string | null;
  is_error: boolean;
  citations: Citation[] | null;
  metadata: Record<string, unknown>;
  provider: string | null;
  model_id: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_usd: string | null;
  created_at: Date;
}

const MSG_COLS = `id, role, content, tool_calls, tool_call_id, tool_name, is_error, citations, metadata, provider, model_id,
  input_tokens, output_tokens, cost_usd, created_at`;

interface ConversationRow {
  id: string;
  title: string;
  provider: string;
  model_id: string;
  system_prompt: string;
  tool_keys: string[];
  knowledge_base_ids: string[];
}

const MAX_TOOL_ROUNDS = 6;
const HISTORY_LIMIT = 60;

export function toChatMessages(rows: DbMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of rows) {
    if (m.role === "user") out.push({ role: "user", content: m.content });
    else if (m.role === "assistant") out.push({ role: "assistant", content: m.content, toolCalls: m.tool_calls ?? undefined });
    else if (m.role === "tool") out.push({ role: "tool", toolCallId: m.tool_call_id ?? "", name: m.tool_name ?? "", content: m.content, isError: m.is_error });
  }
  // Begin altijd bij een gebruikersbericht (consistente tool-paren na inkorten).
  const firstUser = out.findIndex((m) => m.role === "user");
  return firstUser > 0 ? out.slice(firstUser) : out;
}

/** Voor tool-calls zonder resultaat: verwerk afgeronde uitvoeringen; retourneert nog wachtende goedkeuringen. */
async function resolvePendingToolCalls(ctx: TenantContext, conv: ConversationRow, rows: DbMessage[], insertPlaceholders: boolean, emit: (e: ChatEvent) => Promise<void> | void) {
  const answered = new Set(rows.filter((m) => m.role === "tool").map((m) => m.tool_call_id));
  const lastAssistant = [...rows].reverse().find((m) => m.role === "assistant");
  const open = (lastAssistant?.tool_calls ?? []).filter((c) => !answered.has(c.id));
  const stillPending: { approvalId: string; toolKey: string }[] = [];
  for (const call of open) {
    const [exec] = await withTenant(ctx, (tx) => tx<{ status: string; output: unknown; error: string | null; approval_id: string | null; tool_key: string; injection_flags: string[] }[]>`
      select status, output, error, approval_id, tool_key, injection_flags from tool_executions
       where conversation_id = ${conv.id} and tool_call_id = ${call.id} order by created_at desc limit 1`);
    let content: string;
    let isError = false;
    if (exec && (exec.status === "pending_approval" || exec.status === "running")) {
      if (!insertPlaceholders) {
        stillPending.push({ approvalId: exec.approval_id ?? "", toolKey: exec.tool_key });
        continue;
      }
      content = "Niet uitgevoerd: deze actie wachtte nog op goedkeuring toen de gebruiker verder ging.";
      isError = true;
    } else if (exec) {
      const f = formatToolResultForModel({
        executionId: null,
        toolKey: exec.tool_key,
        status: exec.status === "succeeded" ? "succeeded" : exec.status === "rejected" ? "rejected" : "failed",
        output: exec.output,
        error: exec.error ?? (exec.status === "rejected" ? "Afgewezen door een beheerder" : undefined),
        injectionFlags: exec.injection_flags ?? [],
      });
      content = f.content;
      isError = f.isError;
    } else {
      content = "Niet uitgevoerd.";
      isError = true;
    }
    const [msg] = await withTenant(ctx, (tx) => tx<DbMessage[]>`
      insert into messages (org_id, conversation_id, role, content, tool_call_id, tool_name, is_error)
      values (app_org_id(), ${conv.id}, 'tool', ${content}, ${call.id}, ${call.name}, ${isError})
      returning ${tx.unsafe(MSG_COLS)}`);
    rows.push(msg);
    await emit({ type: "tool_result", message: msg, status: exec?.status ?? "failed" });
  }
  return stillPending;
}

export async function runConversationTurn(opts: {
  ctx: TenantContext;
  role: OrgRole;
  conversationId: string;
  userContent?: string;
  emit: (e: ChatEvent) => Promise<void> | void;
  signal?: AbortSignal;
}) {
  const { ctx, emit } = opts;
  const { conv, rows } = await withTenant(ctx, async (tx) => {
    const [conv] = await tx<ConversationRow[]>`
      select id, title, provider, model_id, system_prompt, tool_keys, knowledge_base_ids from conversations where id = ${opts.conversationId}`;
    if (!conv) throw new ApiError(404, "Gesprek niet gevonden");
    const rows = await tx<DbMessage[]>`
      select * from (select ${tx.unsafe(MSG_COLS)} from messages where conversation_id = ${conv.id} order by created_at desc limit ${HISTORY_LIMIT}) m
      order by created_at`;
    return { conv, rows };
  });

  const pending = await resolvePendingToolCalls(ctx, conv, rows, Boolean(opts.userContent), emit);
  if (pending.length) {
    for (const p of pending) await emit({ type: "approval_required", approvalId: p.approvalId, toolKey: p.toolKey });
    return;
  }

  if (opts.userContent) {
    const [msg] = await withTenant(ctx, async (tx) => {
      const r = await tx<DbMessage[]>`
        insert into messages (org_id, conversation_id, role, content) values (app_org_id(), ${conv.id}, 'user', ${opts.userContent!})
        returning ${tx.unsafe(MSG_COLS)}`;
      if (conv.title === "Nieuw gesprek") {
        const title = opts.userContent!.replace(/\s+/g, " ").trim().slice(0, 60);
        await tx`update conversations set title = ${title} where id = ${conv.id}`;
      }
      return r;
    });
    rows.push(msg);
    await emit({ type: "user_message", message: msg });
  }

  // Kennisbank-context (RAG) voor de laatste gebruikersvraag.
  let citations: Citation[] = [];
  let ragContext = "";
  const lastUser = [...rows].reverse().find((m) => m.role === "user");
  if (conv.knowledge_base_ids.length && lastUser) {
    const hits = await searchKnowledge(ctx, { query: lastUser.content, knowledgeBaseIds: conv.knowledge_base_ids, topK: 5 });
    const built = buildKnowledgeContext(hits);
    ragContext = built.context;
    citations = built.citations;
    await emit({ type: "citations", citations });
  }

  const tools = await loadTools(ctx, conv.tool_keys);
  const specs = toolSpecs(tools, opts.role);
  const system = [
    conv.system_prompt.trim(),
    specs.length ? "Je kunt tools gebruiken. Gebruik ze alleen wanneer dat nodig is en vat het resultaat helder samen voor de gebruiker." : "",
    ragContext,
    !ragContext && specs.length ? UNTRUSTED_DATA_POLICY : "",
  ].filter(Boolean).join("\n\n");

  const history = toChatMessages(rows);
  let totalIn = 0;
  let totalOut = 0;
  let totalCost: number | null = 0;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let result;
    try {
      result = await runChat({
        ctx,
        provider: conv.provider,
        modelId: conv.model_id,
        source: "chat",
        refType: "conversation",
        refId: conv.id,
        request: { system, messages: history, tools: specs, maxTokens: 16000, effort: "medium", signal: opts.signal },
        onEvent: async (e) => {
          if (e.type === "text") await emit({ type: "text", delta: e.delta });
        },
      });
    } catch (err) {
      if (err instanceof ConfigurationError) {
        await emit({ type: "error", error: err.message, setup: err.setup });
      } else if (err instanceof ProviderError || err instanceof ApiError) {
        await emit({ type: "error", error: err.message });
      } else {
        throw err;
      }
      return;
    }
    totalIn += result.usage.inputTokens;
    totalOut += result.usage.outputTokens;
    totalCost = totalCost === null || result.costUsd === null ? null : totalCost + result.costUsd;

    const [assistant] = await withTenant(ctx, async (tx) => {
      const r = await tx<DbMessage[]>`
        insert into messages (org_id, conversation_id, role, content, tool_calls, citations, metadata, provider, model_id,
          input_tokens, output_tokens, cost_usd)
        values (app_org_id(), ${conv.id}, 'assistant', ${result.text}, ${result.toolCalls.length ? json(tx, result.toolCalls) : null},
          ${round === 0 && citations.length ? json(tx, citations) : null},
          ${json(tx, { stopReason: result.stopReason, notes: result.notes ?? [], latencyMs: result.latencyMs, demo: conv.provider === "demo" })},
          ${conv.provider}, ${result.model}, ${result.usage.inputTokens}, ${result.usage.outputTokens}, ${result.costUsd})
        returning ${tx.unsafe(MSG_COLS)}`;
      await tx`update conversations set total_input_tokens = total_input_tokens + ${result.usage.inputTokens},
                 total_output_tokens = total_output_tokens + ${result.usage.outputTokens},
                 total_cost_usd = total_cost_usd + ${result.costUsd ?? 0}, updated_at = now()
               where id = ${conv.id}`;
      return r;
    });
    await emit({ type: "assistant_message", message: assistant });
    history.push({ role: "assistant", content: result.text, toolCalls: result.toolCalls, raw: result.raw, rawProvider: result.provider });

    if (!result.toolCalls.length) break;

    let waiting = false;
    for (const call of result.toolCalls) {
      await emit({ type: "tool_started", toolKey: call.name, input: call.input, callId: call.id });
      const exec = await executeTool({
        ctx,
        role: opts.role,
        toolKey: call.name,
        input: call.input,
        actor: { type: "chat", id: conv.id, knowledgeBaseIds: conv.knowledge_base_ids },
        conversationId: conv.id,
        toolCallId: call.id,
      });
      if (exec.status === "pending_approval") {
        waiting = true;
        await emit({ type: "approval_required", approvalId: exec.approvalId!, toolKey: call.name });
        continue;
      }
      const f = formatToolResultForModel(exec);
      const [toolMsg] = await withTenant(ctx, (tx) => tx<DbMessage[]>`
        insert into messages (org_id, conversation_id, role, content, tool_call_id, tool_name, is_error, metadata)
        values (app_org_id(), ${conv.id}, 'tool', ${f.content}, ${call.id}, ${call.name}, ${f.isError},
                ${json(tx, { status: exec.status, executionId: exec.executionId, output: exec.output ?? null, injectionFlags: exec.injectionFlags })})
        returning ${tx.unsafe(MSG_COLS)}`);
      history.push({ role: "tool", toolCallId: call.id, name: call.name, content: f.content, isError: f.isError });
      await emit({ type: "tool_result", message: toolMsg, status: exec.status });
    }
    if (waiting) break;
  }

  await emit({ type: "done", inputTokens: totalIn, outputTokens: totalOut, costUsd: totalCost });
}
