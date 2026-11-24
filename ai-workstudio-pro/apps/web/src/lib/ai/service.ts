import { withTenant, type TenantContext, type Tx } from "@/lib/db";
import { demoProviderEnabled, env } from "@/lib/env";
import { ConfigurationError, ApiError } from "@/lib/api/errors";
import { decryptSecret } from "@/lib/security/crypto";
import { catalogEntry, computeCost } from "@/lib/ai/catalog";
import { anthropicProvider } from "@/lib/ai/providers/anthropic";
import { openaiProvider } from "@/lib/ai/providers/openai";
import { demoProvider } from "@/lib/ai/providers/demo";
import {
  ProviderError,
  type ChatRequest,
  type ChatResult,
  type LLMProvider,
  type ModelCapabilities,
  type ProviderCredentials,
  type ProviderId,
  type StreamEvent,
} from "@/lib/ai/types";

const PROVIDERS: Record<ProviderId, LLMProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  demo: demoProvider,
};

/** Alleen voor tests: provider vervangen door een mock. */
const overrides = new Map<ProviderId, LLMProvider>();
export function __setProviderForTests(id: ProviderId, provider: LLMProvider | null) {
  if (provider) overrides.set(id, provider);
  else overrides.delete(id);
}

export function getProvider(id: string): LLMProvider {
  const p = overrides.get(id as ProviderId) ?? PROVIDERS[id as ProviderId];
  if (!p) throw new ApiError(400, `Onbekende AI-provider: ${id}`);
  return p;
}

export function isProviderId(id: string): id is ProviderId {
  return id === "anthropic" || id === "openai" || id === "demo";
}

export interface ResolvedModel extends ModelCapabilities {
  provider: ProviderId;
  modelId: string;
  displayName: string;
  inputPrice: number | null;
  outputPrice: number | null;
  maxOutputTokens: number | null;
  kind: "chat" | "embedding";
}

export interface ProviderStatus {
  provider: ProviderId;
  configured: boolean;
  source: "workspace" | "server" | "none" | "builtin";
  hint: string | null;
  status: "active" | "invalid" | null;
  lastError: string | null;
  lastVerifiedAt: string | null;
}

/** Status van alle providers voor een workspace (zonder geheimen). */
export async function providerStatuses(tx: Tx): Promise<ProviderStatus[]> {
  const rows = await tx<{ provider: string; value_hint: string; status: "active" | "invalid"; last_error: string | null; last_verified_at: Date | null }[]>`
    select provider, value_hint, status, last_error, last_verified_at from credentials where kind = 'llm'`;
  const e = env();
  const list: ProviderStatus[] = (["anthropic", "openai"] as const).map((provider) => {
    const row = rows.find((r) => r.provider === provider);
    const envKey = provider === "anthropic" ? e.ANTHROPIC_API_KEY : e.OPENAI_API_KEY;
    return {
      provider,
      configured: Boolean(row || envKey),
      source: row ? "workspace" : envKey ? "server" : "none",
      hint: row?.value_hint ?? (envKey ? "via serverconfiguratie" : null),
      status: row?.status ?? null,
      lastError: row?.last_error ?? null,
      lastVerifiedAt: row?.last_verified_at?.toISOString() ?? null,
    };
  });
  if (demoProviderEnabled()) {
    list.push({ provider: "demo", configured: true, source: "builtin", hint: "lokale simulatie", status: "active", lastError: null, lastVerifiedAt: null });
  }
  return list;
}

export async function resolveCredentials(tx: Tx, orgId: string, provider: ProviderId): Promise<ProviderCredentials> {
  if (provider === "demo") {
    if (!demoProviderEnabled()) {
      throw new ConfigurationError("De demo-simulator is uitgeschakeld op deze server.", { provider: "demo", where: "ENABLE_DEMO_PROVIDER" });
    }
    return { apiKey: "demo" };
  }
  const [row] = await tx<{ encrypted_value: string; config: { base_url?: string } }[]>`
    select encrypted_value, config from credentials where kind = 'llm' and provider = ${provider} order by created_at limit 1`;
  if (row) {
    return { apiKey: decryptSecret(row.encrypted_value, `${orgId}:llm:${provider}`), baseUrl: row.config?.base_url ?? null };
  }
  const envKey = provider === "anthropic" ? env().ANTHROPIC_API_KEY : env().OPENAI_API_KEY;
  if (envKey) return { apiKey: envKey };
  const label = provider === "anthropic" ? "Anthropic (Claude)" : "OpenAI";
  throw new ConfigurationError(
    `Er is nog geen API-sleutel voor ${label} ingesteld. Ga naar Instellingen → AI-providers om de verbinding te configureren.`,
    { provider, where: "settings/providers" },
  );
}

/** Standaard chatmodel: het standaardmodel van een gekoppelde provider, anders het eerste beschikbare (demo als laatste). */
export async function defaultChatModel(tx: Tx): Promise<{ provider: ProviderId; modelId: string } | null> {
  const statuses = await providerStatuses(tx);
  const configured = new Set(statuses.filter((s) => s.configured).map((s) => s.provider));
  const rows = await tx<{ provider: ProviderId; model_id: string; is_default: boolean }[]>`
    select provider, model_id, is_default from ai_models where is_enabled and kind = 'chat'
     order by (provider = 'demo'), is_default desc, created_at`;
  const pick = rows.find((r) => configured.has(r.provider));
  return pick ? { provider: pick.provider, modelId: pick.model_id } : null;
}

export async function resolveModel(tx: Tx, provider: string, modelId: string): Promise<ResolvedModel> {
  if (!isProviderId(provider)) throw new ApiError(400, `Onbekende AI-provider: ${provider}`);
  const [row] = await tx<{
    display_name: string; kind: "chat" | "embedding"; input_price: string | null; output_price: string | null; max_output_tokens: number | null;
    supports_tools: boolean; supports_json: boolean; supports_temperature: boolean; supports_effort: boolean; is_enabled: boolean;
  }[]>`select display_name, kind, input_price, output_price, max_output_tokens, supports_tools, supports_json,
         supports_temperature, supports_effort, is_enabled
       from ai_models where provider = ${provider} and model_id = ${modelId}`;
  if (!row || !row.is_enabled) {
    throw new ApiError(400, `Model ${modelId} (${provider}) is niet beschikbaar in deze workspace. Activeer of synchroniseer het onder Instellingen → Modellen.`);
  }
  return {
    provider,
    modelId,
    displayName: row.display_name,
    kind: row.kind,
    inputPrice: row.input_price === null ? null : Number(row.input_price),
    outputPrice: row.output_price === null ? null : Number(row.output_price),
    maxOutputTokens: row.max_output_tokens,
    supportsTools: row.supports_tools,
    supportsJson: row.supports_json,
    supportsTemperature: row.supports_temperature,
    supportsEffort: row.supports_effort,
  };
}

export type UsageSource = "chat" | "prompt_test" | "app" | "agent" | "orchestrator" | "workflow" | "embedding" | "verification";

export interface UsageRecord {
  provider: string;
  modelId: string;
  source: UsageSource;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  costUsd: number | null;
  latencyMs?: number;
  success?: boolean;
  errorCode?: string | null;
  refType?: string;
  refId?: string | null;
}

export async function recordUsage(tx: Tx, u: UsageRecord) {
  await tx`insert into usage_events (org_id, user_id, provider, model_id, source, input_tokens, output_tokens, cached_input_tokens,
             cost_usd, latency_ms, success, error_code, ref_type, ref_id)
           values (app_org_id(), app_user_id(), ${u.provider}, ${u.modelId}, ${u.source}, ${u.inputTokens}, ${u.outputTokens},
             ${u.cachedInputTokens ?? 0}, ${u.costUsd}, ${u.latencyMs ?? null}, ${u.success ?? true}, ${u.errorCode ?? null},
             ${u.refType ?? null}, ${u.refId ?? null})`;
}

/** Controleert het maandbudget van de workspace (indien ingesteld). */
export async function assertWithinBudget(tx: Tx) {
  const [row] = await tx<{ budget: string | null; spent: string }[]>`
    select o.monthly_budget_usd as budget,
           coalesce((select sum(cost_usd) from usage_events where org_id = o.id and created_at >= date_trunc('month', now())), 0) as spent
      from organizations o where o.id = app_org_id()`;
  if (row?.budget !== null && row?.budget !== undefined && Number(row.spent) >= Number(row.budget)) {
    throw new ApiError(402, `Het maandbudget van $${Number(row.budget).toFixed(2)} is bereikt. Verhoog het budget onder Instellingen.`);
  }
}

export interface RunChatOptions {
  ctx: TenantContext;
  provider: string;
  modelId: string;
  request: Omit<ChatRequest, "model">;
  source: UsageSource;
  refType?: string;
  refId?: string | null;
  onEvent?: (e: StreamEvent) => void | Promise<void>;
}

export interface RunChatResult extends ChatResult {
  costUsd: number | null;
  latencyMs: number;
  model: string;
  provider: ProviderId;
}

/**
 * Centrale LLM-aanroep: lost model en sleutel op, streamt, registreert verbruik en kosten.
 * Fouten van de provider worden genormaliseerd en ook als (mislukt) verbruik gelogd.
 */
export async function runChat(opts: RunChatOptions): Promise<RunChatResult> {
  const { model, creds } = await withTenant(opts.ctx, async (tx) => {
    await assertWithinBudget(tx);
    const model = await resolveModel(tx, opts.provider, opts.modelId);
    if (model.kind !== "chat") throw new ApiError(400, "Dit is een embeddingmodel en kan niet chatten.");
    const creds = await resolveCredentials(tx, opts.ctx.orgId, model.provider);
    return { model, creds };
  });
  const provider = getProvider(model.provider);
  const started = Date.now();
  try {
    let result: ChatResult | null = null;
    const req: ChatRequest = {
      ...opts.request,
      model: model.modelId,
      tools: model.supportsTools ? opts.request.tools : undefined,
      maxTokens: Math.min(opts.request.maxTokens ?? 16000, model.maxOutputTokens ?? 128000),
    };
    for await (const ev of provider.chatStream(req, creds, model)) {
      if (ev.type === "done") result = ev.result;
      await opts.onEvent?.(ev);
    }
    if (!result) throw new ProviderError(model.provider, "unknown", "Geen antwoord ontvangen van de provider");
    const latencyMs = Date.now() - started;
    const costUsd = computeCost(result.usage, model);
    await withTenant(opts.ctx, (tx) =>
      recordUsage(tx, {
        provider: model.provider, modelId: model.modelId, source: opts.source, inputTokens: result!.usage.inputTokens,
        outputTokens: result!.usage.outputTokens, cachedInputTokens: result!.usage.cachedInputTokens, costUsd, latencyMs,
        refType: opts.refType, refId: opts.refId ?? null,
      }),
    );
    return { ...result, costUsd, latencyMs, provider: model.provider };
  } catch (err) {
    const pe = err instanceof ProviderError ? err : new ProviderError(model.provider, "unknown", err instanceof Error ? err.message : String(err));
    await withTenant(opts.ctx, (tx) =>
      recordUsage(tx, {
        provider: model.provider, modelId: model.modelId, source: opts.source, inputTokens: 0, outputTokens: 0, costUsd: 0,
        latencyMs: Date.now() - started, success: false, errorCode: pe.code, refType: opts.refType, refId: opts.refId ?? null,
      }),
    ).catch(() => {});
    throw pe;
  }
}

/** Synchroniseert de modellen van een provider via de echte /v1/models-API. */
export async function syncProviderModels(ctx: TenantContext, provider: ProviderId) {
  const creds = await withTenant(ctx, (tx) => resolveCredentials(tx, ctx.orgId, provider));
  const models = await getProvider(provider).listModels(creds);
  await withTenant(ctx, async (tx) => {
    for (const m of models) {
      const cat = catalogEntry(provider, m.id);
      const isOpenAiChat = provider === "openai" && m.kind === "chat";
      await tx`
        insert into ai_models (org_id, provider, model_id, display_name, kind, context_window, max_output_tokens, input_price, output_price,
          supports_tools, supports_json, supports_temperature, supports_effort, embedding_dims, is_enabled, source, verified_at)
        values (app_org_id(), ${provider}, ${m.id}, ${cat?.displayName ?? m.displayName}, ${m.kind},
          ${m.contextWindow ?? cat?.contextWindow ?? null}, ${m.maxOutputTokens ?? cat?.maxOutputTokens ?? null},
          ${cat?.inputPrice ?? null}, ${cat?.outputPrice ?? null},
          ${cat?.supportsTools ?? m.kind === "chat"}, ${cat?.supportsJson ?? m.kind === "chat"},
          ${cat?.supportsTemperature ?? (isOpenAiChat && !/^(o\d|gpt-5|gpt-6)/.test(m.id))},
          ${cat?.supportsEffort ?? provider === "anthropic"},
          ${m.kind === "embedding" ? (cat?.embeddingDims ?? (m.id === "text-embedding-3-small" ? 1536 : null)) : null},
          ${Boolean(cat) || provider === "anthropic"}, 'synced', now())
        on conflict (org_id, provider, model_id) do update set
          verified_at = now(),
          context_window = coalesce(excluded.context_window, ai_models.context_window),
          max_output_tokens = coalesce(excluded.max_output_tokens, ai_models.max_output_tokens)`;
    }
    await tx`update credentials set status = 'active', last_error = null, last_verified_at = now()
             where kind = 'llm' and provider = ${provider}`;
  });
  return models.length;
}

/** Embeddings met het standaard-embeddingmodel van de workspace; null als er geen beschikbaar is. */
export async function embedTexts(
  ctx: TenantContext,
  texts: string[],
  prefer?: { provider: string; model: string } | null,
): Promise<{ vectors: number[][]; provider: string; model: string } | null> {
  if (!texts.length) return null;
  const choice = await withTenant(ctx, async (tx) => {
    const rows = await tx<{ provider: ProviderId; model_id: string; input_price: string | null }[]>`
      select provider, model_id, input_price from ai_models
       where kind = 'embedding' and is_enabled and embedding_dims = 1536
       order by (provider = 'demo'), is_default desc, created_at`;
    // Een kennisbank met bestaande embeddings moet altijd hetzelfde model gebruiken.
    const candidates = prefer ? rows.filter((r) => r.provider === prefer.provider && r.model_id === prefer.model) : rows;
    for (const r of candidates) {
      if (r.provider === "demo" && !demoProviderEnabled()) continue;
      try {
        const creds = await resolveCredentials(tx, ctx.orgId, r.provider);
        return { ...r, creds };
      } catch {
        continue;
      }
    }
    return null;
  });
  if (!choice) return null;
  const provider = getProvider(choice.provider);
  if (!provider.embed) return null;
  const started = Date.now();
  const vectors: number[][] = [];
  let tokens = 0;
  for (let i = 0; i < texts.length; i += 64) {
    const res = await provider.embed(texts.slice(i, i + 64).map((t) => t.slice(0, 24000)), choice.model_id, choice.creds);
    vectors.push(...res.vectors);
    tokens += res.usage.inputTokens;
  }
  const cost = choice.input_price === null ? null : (tokens * Number(choice.input_price)) / 1_000_000;
  await withTenant(ctx, (tx) =>
    recordUsage(tx, { provider: choice.provider, modelId: choice.model_id, source: "embedding", inputTokens: tokens, outputTokens: 0, costUsd: cost, latencyMs: Date.now() - started }),
  );
  return { vectors, provider: choice.provider, model: choice.model_id };
}
