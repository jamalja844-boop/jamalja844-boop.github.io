import OpenAI from "openai";
import { classifyOpenAiModel } from "@/lib/ai/catalog";
import {
  ProviderError,
  type ChatMessage,
  type ChatRequest,
  type LLMProvider,
  type ModelCapabilities,
  type ProviderCredentials,
  type StopReason,
  type StreamEvent,
  type ToolCall,
} from "@/lib/ai/types";

type OAMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

function client(creds: ProviderCredentials) {
  return new OpenAI({
    apiKey: creds.apiKey,
    baseURL: creds.baseUrl || undefined,
    maxRetries: 2,
    timeout: 10 * 60_000,
    ...(creds.fetch ? { fetch: creds.fetch } : {}),
  });
}

export function toOpenAiMessages(system: string | undefined, messages: ChatMessage[]): OAMessage[] {
  const out: OAMessage[] = [];
  if (system?.trim()) out.push({ role: "system", content: system.trim() });
  for (const m of messages) {
    if (m.role === "user") out.push({ role: "user", content: m.content });
    else if (m.role === "assistant") {
      out.push({
        role: "assistant",
        content: m.content || null,
        ...(m.toolCalls?.length
          ? {
              tool_calls: m.toolCalls.map((tc) => ({
                id: tc.id,
                type: "function" as const,
                function: { name: tc.name, arguments: JSON.stringify(tc.input) },
              })),
            }
          : {}),
      });
    } else {
      out.push({ role: "tool", tool_call_id: m.toolCallId, content: m.isError ? `FOUT: ${m.content}` : m.content });
    }
  }
  return out;
}

function mapStop(reason: string | null | undefined): StopReason {
  switch (reason) {
    case "stop":
      return "end";
    case "tool_calls":
    case "function_call":
      return "tool_use";
    case "length":
      return "max_tokens";
    case "content_filter":
      return "refusal";
    default:
      return "other";
  }
}

export function mapOpenAiError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  if (err instanceof OpenAI.AuthenticationError || err instanceof OpenAI.PermissionDeniedError)
    return new ProviderError("openai", "auth", "De OpenAI API-sleutel is ongeldig of heeft geen toegang.", err.status);
  if (err instanceof OpenAI.RateLimitError)
    return new ProviderError("openai", "rate_limit", "OpenAI rate limit of quotum bereikt.", 429);
  if (err instanceof OpenAI.NotFoundError)
    return new ProviderError("openai", "not_found", "Model niet gevonden bij OpenAI. Synchroniseer de modellen.", 404);
  if (err instanceof OpenAI.BadRequestError)
    return new ProviderError("openai", "bad_request", `OpenAI weigerde het verzoek: ${err.message}`, 400);
  if (err instanceof OpenAI.InternalServerError)
    return new ProviderError("openai", "overloaded", "OpenAI is tijdelijk niet beschikbaar.", err.status);
  if (err instanceof OpenAI.APIConnectionError)
    return new ProviderError("openai", "network", "Geen verbinding met OpenAI (netwerk of time-out).");
  if (err instanceof OpenAI.APIError) return new ProviderError("openai", "unknown", `OpenAI-fout: ${err.message}`, err.status);
  return new ProviderError("openai", "unknown", err instanceof Error ? err.message : "Onbekende fout bij OpenAI");
}

export const openaiProvider: LLMProvider = {
  id: "openai",
  name: "OpenAI",
  requiresKey: true,

  async *chatStream(req: ChatRequest, creds: ProviderCredentials, caps: ModelCapabilities): AsyncGenerator<StreamEvent> {
    const openai = client(creds);
    let system = req.system ?? "";
    let responseFormat: OpenAI.Chat.Completions.ChatCompletionCreateParams["response_format"] | undefined;
    if (req.responseFormat?.type === "json_schema") {
      responseFormat = {
        type: "json_schema",
        json_schema: { name: req.responseFormat.name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64), schema: req.responseFormat.schema, strict: false },
      };
    } else if (req.responseFormat?.type === "json") {
      responseFormat = { type: "json_object" };
      system += "\n\nAntwoord uitsluitend met één geldig JSON-object.";
    }

    try {
      const stream = await openai.chat.completions.create(
        {
          model: req.model,
          messages: toOpenAiMessages(system, req.messages),
          stream: true,
          stream_options: { include_usage: true },
          ...(req.maxTokens ? { max_completion_tokens: req.maxTokens } : {}),
          ...(caps.supportsTemperature && typeof req.temperature === "number" ? { temperature: req.temperature } : {}),
          ...(responseFormat ? { response_format: responseFormat } : {}),
          ...(req.tools?.length
            ? {
                tools: req.tools.map((t) => ({
                  type: "function" as const,
                  function: { name: t.name, description: t.description, parameters: { type: "object", ...t.inputSchema } },
                })),
              }
            : {}),
        },
        { signal: req.signal },
      );

      let text = "";
      let finish: string | null = null;
      let model = req.model;
      let usage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
      const partial = new Map<number, { id: string; name: string; args: string }>();

      for await (const chunk of stream) {
        model = chunk.model || model;
        if (chunk.usage) {
          usage = {
            inputTokens: chunk.usage.prompt_tokens ?? 0,
            outputTokens: chunk.usage.completion_tokens ?? 0,
            cachedInputTokens: chunk.usage.prompt_tokens_details?.cached_tokens ?? 0,
          };
        }
        const choice = chunk.choices?.[0];
        if (!choice) continue;
        if (choice.delta?.content) {
          text += choice.delta.content;
          yield { type: "text", delta: choice.delta.content };
        }
        for (const tc of choice.delta?.tool_calls ?? []) {
          const cur = partial.get(tc.index) ?? { id: "", name: "", args: "" };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name += tc.function.name;
          if (tc.function?.arguments) cur.args += tc.function.arguments;
          partial.set(tc.index, cur);
        }
        if (choice.finish_reason) finish = choice.finish_reason;
      }

      const toolCalls: ToolCall[] = [];
      for (const [, p] of [...partial.entries()].sort((a, b) => a[0] - b[0])) {
        let input: Record<string, unknown>;
        try {
          input = p.args ? JSON.parse(p.args) : {};
        } catch {
          input = { __invalid_json: p.args };
        }
        const call = { id: p.id || `call_${toolCalls.length}`, name: p.name, input };
        toolCalls.push(call);
        yield { type: "tool_call", call };
      }
      const stopReason = mapStop(finish);
      yield {
        type: "done",
        result: {
          text,
          toolCalls: stopReason === "max_tokens" ? [] : toolCalls,
          usage,
          stopReason: toolCalls.length && stopReason === "end" ? "tool_use" : stopReason,
          model,
          notes: stopReason === "refusal" ? ["Het antwoord is door het inhoudsfilter van OpenAI geblokkeerd."] : [],
        },
      };
    } catch (err) {
      throw mapOpenAiError(err);
    }
  },

  async listModels(creds) {
    try {
      const openai = client(creds);
      const out = [];
      for await (const m of openai.models.list()) {
        const c = classifyOpenAiModel(m.id);
        if (!c.usable) continue;
        out.push({ id: m.id, displayName: m.id, kind: c.kind, contextWindow: null, maxOutputTokens: null });
      }
      return out.sort((a, b) => a.id.localeCompare(b.id));
    } catch (err) {
      throw mapOpenAiError(err);
    }
  },

  async embed(texts, model, creds) {
    try {
      const openai = client(creds);
      const res = await openai.embeddings.create({ model, input: texts });
      return {
        vectors: res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding as number[]),
        usage: { inputTokens: res.usage?.prompt_tokens ?? 0, outputTokens: 0 },
      };
    } catch (err) {
      throw mapOpenAiError(err);
    }
  },
};
