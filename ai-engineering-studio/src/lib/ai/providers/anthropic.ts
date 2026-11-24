import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import {
  ProviderError,
  type ChatMessage,
  type ChatRequest,
  type ChatResult,
  type LLMProvider,
  type ModelCapabilities,
  type ProviderCredentials,
  type StopReason,
  type StreamEvent,
  type ToolCall,
} from "@/lib/ai/types";

type BetaMessageParam = Anthropic.Beta.BetaMessageParam;
type BetaContentBlockParam = Anthropic.Beta.BetaContentBlockParam;

/** Modellen die server-side refusal-fallbacks ondersteunen (beta, standaard ingeschakeld). */
const FALLBACK_MODELS = new Set(["claude-fable-5-2", "claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

function client(creds: ProviderCredentials) {
  return new Anthropic({
    apiKey: creds.apiKey,
    baseURL: creds.baseUrl || undefined,
    maxRetries: 2,
    timeout: 10 * 60_000,
    ...(creds.fetch ? { fetch: creds.fetch } : {}),
  });
}

/** Zet genormaliseerde berichten om naar Anthropic Messages-formaat. */
export function toAnthropicMessages(messages: ChatMessage[]): BetaMessageParam[] {
  const out: BetaMessageParam[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      if (Array.isArray(m.raw) && m.rawProvider === "anthropic") {
        // Exacte herhaling binnen dezelfde tool-loop (behoudt thinking-blokken ongewijzigd).
        out.push({ role: "assistant", content: m.raw as BetaContentBlockParam[] });
        continue;
      }
      const blocks: BetaContentBlockParam[] = [];
      if (m.content.trim()) blocks.push({ type: "text", text: m.content });
      for (const tc of m.toolCalls ?? []) blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
      if (blocks.length) out.push({ role: "assistant", content: blocks });
    } else {
      const block: BetaContentBlockParam = {
        type: "tool_result",
        tool_use_id: m.toolCallId,
        content: m.content,
        ...(m.isError ? { is_error: true } : {}),
      };
      // Alle tool-resultaten van één beurt in één user-bericht (parallelle tool use).
      const last = out[out.length - 1];
      if (last && last.role === "user" && Array.isArray(last.content) && last.content.every((b) => (b as { type: string }).type === "tool_result")) {
        (last.content as BetaContentBlockParam[]).push(block);
      } else {
        out.push({ role: "user", content: [block] });
      }
    }
  }
  return out;
}

function mapStop(reason: string | null | undefined): StopReason {
  switch (reason) {
    case "end_turn":
    case "stop_sequence":
      return "end";
    case "tool_use":
      return "tool_use";
    case "max_tokens":
      return "max_tokens";
    case "refusal":
      return "refusal";
    default:
      return "other";
  }
}

export function mapAnthropicError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError)
    return new ProviderError("anthropic", "auth", "De Anthropic API-sleutel is ongeldig of heeft geen toegang.", err.status);
  if (err instanceof Anthropic.RateLimitError)
    return new ProviderError("anthropic", "rate_limit", "Anthropic rate limit bereikt. Probeer het zo opnieuw.", 429);
  if (err instanceof Anthropic.NotFoundError)
    return new ProviderError("anthropic", "not_found", "Model niet gevonden bij Anthropic. Synchroniseer de modellen.", 404);
  if (err instanceof Anthropic.BadRequestError)
    return new ProviderError("anthropic", "bad_request", `Anthropic weigerde het verzoek: ${err.message}`, 400);
  if (err instanceof Anthropic.InternalServerError)
    return new ProviderError("anthropic", "overloaded", "Anthropic is tijdelijk overbelast of niet beschikbaar.", err.status);
  if (err instanceof Anthropic.APIConnectionError)
    return new ProviderError("anthropic", "network", "Geen verbinding met Anthropic (netwerk of time-out).");
  if (err instanceof Anthropic.APIError)
    return new ProviderError("anthropic", "unknown", `Anthropic-fout: ${err.message}`, err.status);
  return new ProviderError("anthropic", "unknown", err instanceof Error ? err.message : "Onbekende fout bij Anthropic");
}

export const anthropicProvider: LLMProvider = {
  id: "anthropic",
  name: "Anthropic",
  requiresKey: true,

  async *chatStream(req: ChatRequest, creds: ProviderCredentials, caps: ModelCapabilities): AsyncGenerator<StreamEvent> {
    const anthropic = client(creds);
    const useFallback = env().ANTHROPIC_REFUSAL_FALLBACK === "true" && FALLBACK_MODELS.has(req.model);

    let system = req.system ?? "";
    const outputConfig: Anthropic.Beta.BetaOutputConfig = {};
    if (caps.supportsEffort && req.effort) outputConfig.effort = req.effort;
    if (req.responseFormat?.type === "json_schema") {
      outputConfig.format = { type: "json_schema", schema: req.responseFormat.schema };
    } else if (req.responseFormat?.type === "json") {
      system += "\n\nAntwoord uitsluitend met één geldig JSON-object, zonder uitleg of markdown.";
    }

    const params: Anthropic.Beta.MessageCreateParamsStreaming = {
      model: req.model,
      max_tokens: req.maxTokens ?? 16000,
      messages: toAnthropicMessages(req.messages),
      stream: true,
      ...(system.trim() ? { system: system.trim() } : {}),
      ...(req.tools?.length
        ? {
            tools: req.tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: { type: "object" as const, ...t.inputSchema },
              // Grote tool-invoer streamt direct; invoer wordt daarna altijd tegen het schema gevalideerd.
              eager_input_streaming: true,
            })),
          }
        : {}),
      ...(Object.keys(outputConfig).length ? { output_config: outputConfig } : {}),
      ...(useFallback ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
    };

    let emitted = false;
    for (let attempt = 0; ; attempt++) {
      try {
        const streamParams: Omit<typeof params, "stream"> & { stream?: true } = { ...params };
        delete streamParams.stream;
        const stream = anthropic.beta.messages.stream(streamParams, { signal: req.signal });
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            emitted = true;
            yield { type: "text", delta: event.delta.text };
          }
        }
        const message = await stream.finalMessage();
        const toolCalls: ToolCall[] = [];
        let text = "";
        const notes: string[] = [];
        for (const block of message.content) {
          if (block.type === "text") text += block.text;
          else if (block.type === "tool_use") toolCalls.push({ id: block.id, name: block.name, input: (block.input ?? {}) as Record<string, unknown> });
          else if ((block as { type: string }).type === "fallback") {
            const fb = block as unknown as { from?: { model?: string }; to?: { model?: string } };
            notes.push(`Weigering door ${fb.from?.model ?? "model"}; voortgezet door ${fb.to?.model ?? "fallback-model"}`);
          }
        }
        const stopReason = mapStop(message.stop_reason);
        if (stopReason === "refusal") notes.push("Het model heeft dit verzoek geweigerd (veiligheidsbeleid).");
        for (const tc of toolCalls) yield { type: "tool_call", call: tc };
        const result: ChatResult = {
          text,
          // Bij weigering of afgekapte invoer worden tools nooit uitgevoerd.
          toolCalls: stopReason === "refusal" || stopReason === "max_tokens" ? [] : toolCalls,
          usage: {
            inputTokens: (message.usage.input_tokens ?? 0) + (message.usage.cache_creation_input_tokens ?? 0) + (message.usage.cache_read_input_tokens ?? 0),
            outputTokens: message.usage.output_tokens ?? 0,
            cachedInputTokens: message.usage.cache_read_input_tokens ?? 0,
          },
          stopReason,
          model: message.model,
          raw: message.content,
          notes,
        };
        yield { type: "done", result };
        return;
      } catch (err) {
        // Onleesbare tool-JSON of verbroken stream: opnieuw proberen zolang er nog niets getoond is.
        const retryable = !(err instanceof Anthropic.APIError) && !(err instanceof ProviderError) && !emitted && attempt < 2 && !req.signal?.aborted;
        if (retryable) continue;
        throw mapAnthropicError(err);
      }
    }
  },

  async listModels(creds) {
    try {
      const anthropic = client(creds);
      const out = [];
      for await (const m of anthropic.models.list({ limit: 100 })) {
        const info = m as unknown as { id: string; display_name?: string; max_input_tokens?: number; max_tokens?: number };
        out.push({
          id: info.id,
          displayName: info.display_name ?? info.id,
          kind: "chat" as const,
          contextWindow: info.max_input_tokens ?? null,
          maxOutputTokens: info.max_tokens ?? null,
        });
      }
      return out;
    } catch (err) {
      throw mapAnthropicError(err);
    }
  },
};
