/** Provider-onafhankelijke types voor chat, tools en verbruik. */

export type ProviderId = "anthropic" | "openai" | "demo";

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type ChatMessage =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      toolCalls?: ToolCall[];
      /** Provider-eigen contentblokken (bijv. thinking-blokken) voor exacte herhaling binnen een tool-loop. */
      raw?: unknown;
      rawProvider?: ProviderId;
    }
  | { role: "tool"; toolCallId: string; name: string; content: string; isError?: boolean };

export type ResponseFormat =
  | { type: "text" }
  | { type: "json" }
  | { type: "json_schema"; name: string; schema: Record<string, unknown> };

export interface ChatRequest {
  model: string;
  system?: string;
  messages: ChatMessage[];
  tools?: ToolSpec[];
  maxTokens?: number;
  temperature?: number | null;
  effort?: "low" | "medium" | "high" | null;
  responseFormat?: ResponseFormat;
  signal?: AbortSignal;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
}

export type StopReason = "end" | "tool_use" | "max_tokens" | "refusal" | "other";

export interface ChatResult {
  text: string;
  toolCalls: ToolCall[];
  usage: Usage;
  stopReason: StopReason;
  model: string;
  raw?: unknown;
  /** Bijv. 'refusal-fallback: claude-opus-4-8' */
  notes?: string[];
}

export type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "done"; result: ChatResult };

export interface ProviderModelInfo {
  id: string;
  displayName: string;
  kind: "chat" | "embedding";
  contextWindow?: number | null;
  maxOutputTokens?: number | null;
}

export interface ProviderCredentials {
  apiKey: string;
  baseUrl?: string | null;
  /** Alleen voor tests: eigen fetch-implementatie injecteren. */
  fetch?: typeof fetch;
}

export interface ModelCapabilities {
  supportsTools: boolean;
  supportsJson: boolean;
  supportsTemperature: boolean;
  supportsEffort: boolean;
}

export interface LLMProvider {
  id: ProviderId;
  name: string;
  requiresKey: boolean;
  chatStream(req: ChatRequest, creds: ProviderCredentials, caps: ModelCapabilities): AsyncGenerator<StreamEvent>;
  listModels(creds: ProviderCredentials): Promise<ProviderModelInfo[]>;
  embed?(texts: string[], model: string, creds: ProviderCredentials): Promise<{ vectors: number[][]; usage: Usage }>;
}

/** Fout van een AI-provider, genormaliseerd voor de gebruiker. */
export class ProviderError extends Error {
  constructor(
    public provider: ProviderId,
    public code: "auth" | "rate_limit" | "bad_request" | "not_found" | "overloaded" | "network" | "refusal" | "unknown",
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
