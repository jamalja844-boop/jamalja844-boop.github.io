// Structured-JSON text generation across Anthropic, OpenAI, Google Gemini and xAI.
// Each provider is called through its documented API; output is validated with zod.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";
import { getCredentials } from "../server/secrets";
import { getProvider } from "./registry";

export interface LlmResult<T> {
  data: T;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
}

export class ProviderNotConfigured extends Error {}

const cost = (settings: Record<string, string>, i: number, o: number) => {
  const a = parseFloat(settings.costInputPerMTok);
  const b = parseFloat(settings.costOutputPerMTok);
  return Number.isFinite(a) && Number.isFinite(b) ? (i * a + o * b) / 1e6 : null;
};

function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(t);
  } catch {
    const m = t.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("Model did not return valid JSON");
  }
}

async function postJson(url: string, headers: Record<string, string>, body: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(180_000) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${new URL(url).hostname} ${r.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

export async function generateJson<S extends z.ZodType>(owner: string, providerId: string, system: string, user: string, schema: S): Promise<LlmResult<z.infer<S>>> {
  const creds = await getCredentials(owner, providerId);
  const def = getProvider(providerId);
  if (!creds || !def) throw new ProviderNotConfigured(`${def?.name ?? providerId} is not configured`);
  const settings = { ...Object.fromEntries(def.settings.map((s) => [s.key, s.default ?? ""])), ...creds.settings };
  const model = settings.model;
  const jsonSchema = JSON.stringify(z.toJSONSchema(schema));

  if (providerId === "anthropic") {
    const client = new Anthropic({ apiKey: creds.values.apiKey });
    const params = {
      model,
      max_tokens: 16000,
      system,
      messages: [{ role: "user" as const, content: user }],
      output_config: { format: zodOutputFormat(schema), effort: (settings.effort || "medium") as "low" | "medium" | "high" },
    };
    // Server-side refusal fallback is only valid on the newest models.
    const withFallback = /^claude-(opus-5-5|sonnet-5-5|fable-5-2|fable-5-1|opus-5)$/.test(model);
    const res = withFallback
      ? await client.beta.messages.parse({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
      : await client.beta.messages.parse(params);
    if (res.stop_reason === "refusal") throw new Error("Claude declined this request");
    if (res.stop_reason === "max_tokens") throw new Error("Claude response was truncated");
    const parsed = res.parsed_output;
    if (!parsed) throw new Error("Claude returned no parsable output");
    return { data: schema.parse(parsed), provider: providerId, model: res.model, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens, costUsd: cost(settings, res.usage.input_tokens, res.usage.output_tokens) };
  }

  const sys = `${system}\n\nReturn ONLY a JSON object matching this JSON Schema:\n${jsonSchema}`;
  if (providerId === "openai" || providerId === "xai") {
    const base = providerId === "openai" ? "https://api.openai.com/v1" : "https://api.x.ai/v1";
    const j = await postJson(`${base}/chat/completions`, { Authorization: `Bearer ${creds.values.apiKey}` }, {
      model,
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      response_format: { type: "json_object" },
    });
    const text = j.choices?.[0]?.message?.content ?? "";
    return { data: schema.parse(extractJson(text)), provider: providerId, model: j.model ?? model, inputTokens: j.usage?.prompt_tokens ?? 0, outputTokens: j.usage?.completion_tokens ?? 0, costUsd: cost(settings, j.usage?.prompt_tokens ?? 0, j.usage?.completion_tokens ?? 0) };
  }

  if (providerId === "gemini") {
    const j = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { "x-goog-api-key": creds.values.apiKey }, {
      systemInstruction: { parts: [{ text: sys }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { responseMimeType: "application/json" },
    });
    const text = (j.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
    const i = j.usageMetadata?.promptTokenCount ?? 0;
    const o = j.usageMetadata?.candidatesTokenCount ?? 0;
    return { data: schema.parse(extractJson(text)), provider: providerId, model, inputTokens: i, outputTokens: o, costUsd: cost(settings, i, o) };
  }

  throw new Error(`Provider ${providerId} does not support text generation`);
}

/** Lists models for the "Test connection" button. Real API calls, no mocks. */
export async function testProvider(providerId: string, values: Record<string, string>, settings: Record<string, string>): Promise<{ ok: boolean; message: string; models?: string[]; voices?: { id: string; name: string }[] }> {
  const get = async (url: string, headers: Record<string, string>) => {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
    const text = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 200)}`);
    return JSON.parse(text);
  };
  try {
    switch (providerId) {
      case "anthropic": {
        const j = await get("https://api.anthropic.com/v1/models?limit=100", { "x-api-key": values.apiKey, "anthropic-version": "2023-06-01" });
        return { ok: true, message: "Connected", models: j.data.map((m: { id: string }) => m.id) };
      }
      case "openai": {
        const j = await get("https://api.openai.com/v1/models", { Authorization: `Bearer ${values.apiKey}` });
        return { ok: true, message: "Connected", models: j.data.map((m: { id: string }) => m.id).sort() };
      }
      case "xai": {
        const j = await get("https://api.x.ai/v1/models", { Authorization: `Bearer ${values.apiKey}` });
        return { ok: true, message: "Connected", models: j.data.map((m: { id: string }) => m.id) };
      }
      case "gemini": {
        const j = await get("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { "x-goog-api-key": values.apiKey });
        return { ok: true, message: "Connected", models: j.models.map((m: { name: string }) => m.name.replace(/^models\//, "")) };
      }
      case "elevenlabs": {
        const j = await get("https://api.elevenlabs.io/v1/voices", { "xi-api-key": values.apiKey });
        return { ok: true, message: "Connected", voices: j.voices.map((v: { voice_id: string; name: string }) => ({ id: v.voice_id, name: v.name })) };
      }
      case "google-tts": {
        const j = await get(`https://texttospeech.googleapis.com/v1/voices?key=${encodeURIComponent(values.apiKey)}`, {});
        return { ok: true, message: `Connected (${j.voices?.length ?? 0} voices)` };
      }
      case "runway": {
        await get("https://api.dev.runwayml.com/v1/organization", { Authorization: `Bearer ${values.apiKey}`, "X-Runway-Version": "2024-11-06" });
        return { ok: true, message: "Connected" };
      }
      case "kling": {
        const { klingToken } = await import("./video");
        const base = settings.baseUrl || "https://api-singapore.klingai.com";
        await get(`${base}/v1/videos/image2video?pageNum=1&pageSize=1`, { Authorization: `Bearer ${await klingToken(values.accessKey, values.secretKey)}` });
        return { ok: true, message: "Connected" };
      }
      case "shopify": {
        if (!/^[a-z0-9-]+\.myshopify\.com$/i.test(settings.shopDomain || "")) throw new Error("Shop domain must look like your-store.myshopify.com");
        const r = await fetch(`https://${settings.shopDomain}/admin/api/${settings.apiVersion || "2025-07"}/graphql.json`, { method: "POST", headers: { "X-Shopify-Access-Token": values.token, "Content-Type": "application/json" }, body: JSON.stringify({ query: "{ shop { name } }" }) });
        const j = await r.json();
        if (!r.ok || j.errors) throw new Error(JSON.stringify(j.errors ?? r.status));
        return { ok: true, message: `Connected to ${j.data.shop.name}` };
      }
      case "woocommerce": {
        const auth = Buffer.from(`${values.consumerKey}:${values.consumerSecret}`).toString("base64");
        const { assertPublicUrl } = await import("../server/safeFetch");
        const site = (await assertPublicUrl(settings.siteUrl)).origin;
        await get(`${site}/wp-json/wc/v3/products?per_page=1`, { Authorization: `Basic ${auth}` });
        return { ok: true, message: "Connected" };
      }
      default:
        return { ok: false, message: "This provider is not integrated" };
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
