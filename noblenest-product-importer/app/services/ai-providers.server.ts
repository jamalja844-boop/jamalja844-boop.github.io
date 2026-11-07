/**
 * Verbindingstest voor AI-providers. Doet een lichte, kosteloze aanroep (modellenlijst)
 * om te controleren of de API-sleutel geldig is. Tekstgeneratie volgt in fase 5 (AI Studio).
 */
export type AiProviderKey = "ANTHROPIC" | "OPENAI";

export async function testAiConnection(
  provider: AiProviderKey,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; message: string }> {
  const request: { url: string; headers: Record<string, string>; name: string } =
    provider === "ANTHROPIC"
      ? {
          url: "https://api.anthropic.com/v1/models?limit=1",
          headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
          name: "Claude (Anthropic)",
        }
      : {
          url: "https://api.openai.com/v1/models",
          headers: { Authorization: `Bearer ${apiKey}` },
          name: "OpenAI",
        };
  try {
    const response = await fetchImpl(request.url, { headers: request.headers, signal: AbortSignal.timeout(10000) });
    if (response.ok) return { ok: true, message: `Verbinding met ${request.name} geslaagd.` };
    if (response.status === 401 || response.status === 403) {
      return { ok: false, message: `${request.name} weigert de API-sleutel (HTTP ${response.status}). Controleer de sleutel.` };
    }
    return { ok: false, message: `${request.name} gaf een fout (HTTP ${response.status}). Probeer het later opnieuw.` };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `${request.name} is niet bereikbaar: ${reason}` };
  }
}
