import type { ModelCapabilities, ProviderId } from "@/lib/ai/types";

/**
 * Bekende modellen met prijzen (USD per 1M tokens).
 *
 * - Anthropic: model-ID's en prijzen volgens de Anthropic-documentatie (stand 2026-11).
 *   Deze worden direct als selecteerbaar model toegevoegd.
 * - OpenAI: alleen gebruikt om prijzen aan te vullen nadat de modellen via
 *   GET /v1/models daadwerkelijk bij de provider zijn gevonden ("Modellen synchroniseren").
 *   Zo kan de applicatie nooit een niet-bestaand model aanbieden.
 */
export interface CatalogModel extends ModelCapabilities {
  provider: ProviderId;
  modelId: string;
  displayName: string;
  kind: "chat" | "embedding";
  contextWindow: number | null;
  maxOutputTokens: number | null;
  inputPrice: number | null;
  outputPrice: number | null;
  embeddingDims?: number;
  /** Direct toevoegen bij aanmaken van een workspace (alleen bij geverifieerde ID's). */
  seed: boolean;
  isDefault?: boolean;
}

const claude = (modelId: string, displayName: string, inputPrice: number, outputPrice: number, extra: Partial<CatalogModel> = {}): CatalogModel => ({
  provider: "anthropic",
  modelId,
  displayName,
  kind: "chat",
  contextWindow: 1_000_000,
  maxOutputTokens: 128_000,
  inputPrice,
  outputPrice,
  supportsTools: true,
  supportsJson: true,
  // Sampling-parameters (temperature) worden door de huidige Claude-modellen geweigerd.
  supportsTemperature: false,
  supportsEffort: true,
  seed: true,
  ...extra,
});

export const MODEL_CATALOG: CatalogModel[] = [
  claude("claude-opus-5-5", "Claude Opus 5.5", 4, 20, { isDefault: true }),
  claude("claude-sonnet-5-5", "Claude Sonnet 5.5", 2, 10),
  claude("claude-haiku-5-5", "Claude Haiku 5.5", 0.1, 0.5),
  claude("claude-fable-5-2", "Claude Fable 5.2", 8, 40),
  claude("claude-opus-4-8", "Claude Opus 4.8", 5, 25),
  claude("claude-haiku-4-5", "Claude Haiku 4.5", 1, 5, { contextWindow: 200_000, maxOutputTokens: 64_000, supportsEffort: false, seed: false }),

  // OpenAI – prijzen worden pas gebruikt als het model via de API is gevonden.
  { provider: "openai", modelId: "gpt-5.5", displayName: "GPT-5.5", kind: "chat", contextWindow: null, maxOutputTokens: null, inputPrice: 2.5, outputPrice: 15, supportsTools: true, supportsJson: true, supportsTemperature: false, supportsEffort: false, seed: false },
  { provider: "openai", modelId: "gpt-5.4-mini", displayName: "GPT-5.4 mini", kind: "chat", contextWindow: null, maxOutputTokens: null, inputPrice: 0.75, outputPrice: 4.5, supportsTools: true, supportsJson: true, supportsTemperature: false, supportsEffort: false, seed: false },
  { provider: "openai", modelId: "text-embedding-3-small", displayName: "text-embedding-3-small", kind: "embedding", contextWindow: 8191, maxOutputTokens: null, inputPrice: 0.02, outputPrice: 0, embeddingDims: 1536, supportsTools: false, supportsJson: false, supportsTemperature: false, supportsEffort: false, seed: false },

  // Demo-provider: lokaal, geen echte AI, geen kosten. Alleen actief met ENABLE_DEMO_PROVIDER=true.
  { provider: "demo", modelId: "demo-simulator", displayName: "Demo-simulator (geen echte AI)", kind: "chat", contextWindow: 100_000, maxOutputTokens: 4000, inputPrice: 0, outputPrice: 0, supportsTools: true, supportsJson: true, supportsTemperature: false, supportsEffort: false, seed: true },
  { provider: "demo", modelId: "demo-embedding", displayName: "Demo-embedding (hash, geen echte AI)", kind: "embedding", contextWindow: 8000, maxOutputTokens: null, inputPrice: 0, outputPrice: 0, embeddingDims: 1536, supportsTools: false, supportsJson: false, supportsTemperature: false, supportsEffort: false, seed: true },
];

export function catalogEntry(provider: string, modelId: string): CatalogModel | undefined {
  return MODEL_CATALOG.find((m) => m.provider === provider && m.modelId === modelId);
}

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI",
  demo: "Demo-simulator",
};

/** Heuristiek voor OpenAI-modellen die tijdens synchronisatie gevonden worden. */
export function classifyOpenAiModel(id: string): { kind: "chat" | "embedding"; usable: boolean; supportsTemperature: boolean } {
  if (id.startsWith("text-embedding-")) return { kind: "embedding", usable: true, supportsTemperature: false };
  const excluded = /(whisper|tts|dall-e|image|audio|realtime|transcribe|moderation|search|computer-use|babbage|davinci|instruct|codex|sora)/;
  const chat = /^(gpt-|o\d|chatgpt-)/.test(id) && !excluded.test(id);
  // Redeneermodellen (o-serie, gpt-5+) accepteren geen afwijkende temperature.
  const reasoning = /^(o\d|gpt-5|gpt-6)/.test(id);
  return { kind: "chat", usable: chat, supportsTemperature: chat && !reasoning };
}

/** Kosten in USD; null als prijs onbekend is. */
export function computeCost(usage: { inputTokens: number; outputTokens: number }, price: { inputPrice: number | null; outputPrice: number | null }): number | null {
  if (price.inputPrice === null || price.outputPrice === null) return null;
  return (usage.inputTokens * price.inputPrice + usage.outputTokens * price.outputPrice) / 1_000_000;
}
