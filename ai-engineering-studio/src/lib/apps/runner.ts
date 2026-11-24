import { json, withTenant, type TenantContext } from "@/lib/db";
import { roleRank, type OrgRole } from "@/lib/auth/rbac";
import { ApiError } from "@/lib/api/errors";
import { runChat } from "@/lib/ai/service";
import type { ChatMessage } from "@/lib/ai/types";
import { buildKnowledgeContext, searchKnowledge, type Citation } from "@/lib/rag/search";
import { extractJson, validateAgainstSchema } from "@/lib/security/schema";
import { UNTRUSTED_DATA_POLICY } from "@/lib/security/injection";
import { executeTool, formatToolResultForModel, loadTools, toolSpecs } from "@/lib/tools/executor";
import { composeSystemPrompt, type PromptVersionData } from "@/lib/prompts/template";
import type { AppConfig } from "@/lib/apps/presets";

const MAX_ROUNDS = 4;

/** Voert een AI-app uit met de opgegeven invoer (rechten, RAG, tools en uitvoerformaat inbegrepen). */
export async function runApp(ctx: TenantContext, role: OrgRole, appId: string, input: Record<string, string>, opts: { allowDraft: boolean }) {
  const started = Date.now();
  const { app, linked } = await withTenant(ctx, async (tx) => {
    const [app] = await tx<{ id: string; name: string; status: string; min_role: OrgRole; config: AppConfig }[]>`select id, name, status, min_role, config from ai_apps where id = ${appId}`;
    if (!app) throw new ApiError(404, "App niet gevonden");
    let linked = "";
    if (app.config.promptId) {
      const [v] = await tx<PromptVersionData[]>`select v.* from prompts p join prompt_versions v on v.prompt_id = p.id and v.version = p.current_version where p.id = ${app.config.promptId}`;
      if (v) linked = composeSystemPrompt(v, input);
    }
    return { app, linked };
  });
  if (app.status !== "published" && !opts.allowDraft) throw new ApiError(403, "Deze app is nog niet gepubliceerd");
  if (roleRank(role) < roleRank(app.min_role)) throw new ApiError(403, "Je hebt geen toegang tot deze app");
  const cfg = app.config;

  const missing = cfg.inputFields.filter((f) => f.required && !String(input[f.name] ?? "").trim()).map((f) => f.label);
  if (missing.length) throw new ApiError(400, `Vul in: ${missing.join(", ")}`);
  for (const f of cfg.inputFields) {
    const v = input[f.name];
    if (v && f.type === "number" && !Number.isFinite(Number(v.replace(",", ".")))) throw new ApiError(400, `${f.label} moet een getal zijn`);
    if (v && f.type === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) throw new ApiError(400, `${f.label} is geen geldig e-mailadres`);
    if (v && f.type === "select" && f.options?.length && !f.options.includes(v)) throw new ApiError(400, `Ongeldige keuze voor ${f.label}`);
  }
  const userMessage = (cfg.userTemplate || "{{invoer}}").replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_m, n: string) => String(input[n] ?? "")).slice(0, 60_000);

  let citations: Citation[] = [];
  let ragContext = "";
  if (cfg.knowledgeBaseIds?.length) {
    const hits = await searchKnowledge(ctx, { query: userMessage.slice(0, 1000), knowledgeBaseIds: cfg.knowledgeBaseIds, topK: 5 });
    const built = buildKnowledgeContext(hits);
    citations = built.citations;
    ragContext = built.context;
  }
  const tools = await loadTools(ctx, cfg.toolKeys ?? []);
  const specs = toolSpecs(tools, role);
  const system = [cfg.systemPrompt, linked, ragContext, UNTRUSTED_DATA_POLICY].filter(Boolean).join("\n\n");
  const messages: ChatMessage[] = [{ role: "user", content: userMessage }];
  const responseFormat = cfg.output.format === "json_schema" && cfg.output.schema ? { type: "json_schema" as const, name: "app_uitvoer", schema: cfg.output.schema } : undefined;

  let usage = { inputTokens: 0, outputTokens: 0 };
  let cost: number | null = 0;
  let text = "";
  const toolLog: { tool: string; status: string; approvalId?: string }[] = [];
  let status: "succeeded" | "failed" | "waiting_approval" = "succeeded";
  let error: string | null = null;
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const r = await runChat({ ctx, provider: cfg.provider, modelId: cfg.modelId, source: "app", refType: "app", refId: appId, request: { system, messages, tools: specs, maxTokens: 12000, effort: "medium", responseFormat } });
      usage = { inputTokens: usage.inputTokens + r.usage.inputTokens, outputTokens: usage.outputTokens + r.usage.outputTokens };
      cost = cost === null || r.costUsd === null ? null : cost + r.costUsd;
      text = r.text;
      messages.push({ role: "assistant", content: r.text, toolCalls: r.toolCalls, raw: r.raw, rawProvider: r.provider });
      if (!r.toolCalls.length) break;
      let waiting = false;
      for (const call of r.toolCalls) {
        const res = await executeTool({ ctx, role, toolKey: call.name, input: call.input, actor: { type: "app", id: appId, knowledgeBaseIds: cfg.knowledgeBaseIds }, toolCallId: call.id });
        toolLog.push({ tool: call.name, status: res.status, approvalId: res.approvalId });
        if (res.status === "pending_approval") waiting = true;
        const f = formatToolResultForModel(res);
        messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: f.content, isError: f.isError });
      }
      if (waiting) status = "waiting_approval";
    }
  } catch (e) {
    status = "failed";
    error = e instanceof Error ? e.message : String(e);
  }

  let outputJson: unknown = null;
  if (status !== "failed" && responseFormat) {
    const parsed = extractJson(text);
    if (parsed.ok && validateAgainstSchema(responseFormat.schema, parsed.value).valid) outputJson = parsed.value;
    else error = "Uitvoer voldeed niet aan het JSON-schema";
  }
  const latency = Date.now() - started;
  const [run] = await withTenant(ctx, (tx) => tx<{ id: string }[]>`
    insert into app_runs (org_id, app_id, user_id, input, output, output_json, citations, tool_calls, status, error, input_tokens, output_tokens, cost_usd, latency_ms)
    values (app_org_id(), ${appId}, app_user_id(), ${json(tx, input)}, ${text}, ${outputJson === null ? null : json(tx, outputJson)},
            ${citations.length ? json(tx, citations) : null}, ${toolLog.length ? json(tx, toolLog) : null}, ${status}, ${error},
            ${usage.inputTokens}, ${usage.outputTokens}, ${cost}, ${latency})
    returning id`);
  return { id: run.id, status, error, output: text, outputJson, citations, tools: toolLog, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costUsd: cost, latencyMs: latency, provider: cfg.provider };
}
