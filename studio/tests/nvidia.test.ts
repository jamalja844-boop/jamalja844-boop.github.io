import { afterEach, describe, expect, it, vi } from "vitest";
import * as z from "zod/v4";

vi.mock("@/lib/server/secrets", () => ({ getCredentials: async (_o: string, id: string) => (id === "nvidia" ? { values: { apiKey: "nvapi-test" }, settings: { model: "deepseek-ai/deepseek-r1" } } : null) }));
const { generateJson, testProvider } = await import("@/lib/providers/llm");

afterEach(() => vi.unstubAllGlobals());

describe("NVIDIA provider", () => {
  it("calls the OpenAI-compatible endpoint and parses JSON after a <think> block", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ model: "deepseek-ai/deepseek-r1", choices: [{ message: { content: '<think>The user wants a hook…</think>\n```json\n{"hook":"Stop met **zoeken**","cta":"Shop nu"}\n```' } }], usage: { prompt_tokens: 120, completion_tokens: 40 } }), { status: 200 });
    });
    const r = await generateJson("u1", "nvidia", "You are a copywriter.", "Write a hook.", z.object({ hook: z.string(), cta: z.string() }));
    expect(r.data).toEqual({ hook: "Stop met **zoeken**", cta: "Shop nu" });
    expect(r.costUsd).toBe(0);
    expect(calls[0].url).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
    expect(new Headers(calls[0].init.headers).get("authorization")).toBe("Bearer nvapi-test");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.model).toBe("deepseek-ai/deepseek-r1");
    expect(body.messages[0].content).toContain("JSON Schema");
  });

  it("reports an invalid key in 'Test connection'", async () => {
    vi.stubGlobal("fetch", async (url: string) => (String(url).endsWith("/models") ? new Response(JSON.stringify({ data: [{ id: "meta/llama-3.3-70b-instruct" }] }), { status: 200 }) : new Response('{"status":401,"title":"Unauthorized"}', { status: 401 })));
    const r = await testProvider("nvidia", { apiKey: "nvapi-wrong" }, {});
    expect(r.ok).toBe(false);
    expect(r.message).toContain("401");
  });

  it("lists models when the key works", async () => {
    vi.stubGlobal("fetch", async (url: string) => (String(url).endsWith("/models") ? new Response(JSON.stringify({ data: [{ id: "meta/llama-3.3-70b-instruct" }, { id: "deepseek-ai/deepseek-r1" }] }), { status: 200 }) : new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] }), { status: 200 })));
    const r = await testProvider("nvidia", { apiKey: "nvapi-ok" }, {});
    expect(r).toMatchObject({ ok: true, models: ["deepseek-ai/deepseek-r1", "meta/llama-3.3-70b-instruct"] });
  });
});
