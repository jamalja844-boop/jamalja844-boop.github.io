import { describe, expect, it } from "vitest";
import { anthropicProvider, toAnthropicMessages } from "@/lib/ai/providers/anthropic";
import { openaiProvider } from "@/lib/ai/providers/openai";
import { demoProvider, generateFromSchema } from "@/lib/ai/providers/demo";
import { ProviderError, type ChatResult, type StreamEvent } from "@/lib/ai/types";

function sse(events: string[], headers: Record<string, string> = {}) {
  const body = new ReadableStream({
    start(c) {
      for (const e of events) c.enqueue(new TextEncoder().encode(e));
      c.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream", ...headers } });
}

async function collect(gen: AsyncGenerator<StreamEvent>) {
  let text = "";
  let result: ChatResult | null = null;
  for await (const e of gen) {
    if (e.type === "text") text += e.delta;
    if (e.type === "done") result = e.result;
  }
  return { text, result: result! };
}

const caps = { supportsTools: true, supportsJson: true, supportsTemperature: false, supportsEffort: true };

describe("Anthropic-adapter", () => {
  it("streamt tekst, verzamelt tool-calls en gebruik, en stuurt correcte parameters", async () => {
    let captured: { url: string; body: Record<string, unknown>; headers: Headers } | null = null;
    const ev = (type: string, data: unknown) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    const fetchMock = (async (url: string | URL, init?: RequestInit) => {
      captured = { url: String(url), body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) };
      return sse([
        ev("message_start", { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 12, output_tokens: 1 } } }),
        ev("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
        ev("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Ik reken " } }),
        ev("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "dit uit." } }),
        ev("content_block_stop", { type: "content_block_stop", index: 0 }),
        ev("content_block_start", { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_1", name: "calculator", input: {} } }),
        ev("content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"expression": "120*4.5"}' } }),
        ev("content_block_stop", { type: "content_block_stop", index: 1 }),
        ev("message_delta", { type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 25 } }),
        ev("message_stop", { type: "message_stop" }),
      ]);
    }) as unknown as typeof fetch;

    const { text, result } = await collect(
      anthropicProvider.chatStream(
        {
          model: "claude-opus-5-5",
          system: "Systeem",
          messages: [{ role: "user", content: "Bereken" }],
          tools: [{ name: "calculator", description: "Rekent", inputSchema: { properties: { expression: { type: "string" } }, required: ["expression"] } }],
          temperature: 0.7,
          effort: "medium",
        },
        { apiKey: "test-key-niet-echt", fetch: fetchMock },
        caps,
      ),
    );
    expect(text).toBe("Ik reken dit uit.");
    expect(result.toolCalls).toEqual([{ id: "toolu_1", name: "calculator", input: { expression: "120*4.5" } }]);
    expect(result.stopReason).toBe("tool_use");
    expect(result.usage.outputTokens).toBe(25);
    const c = captured!;
    expect(c.body.model).toBe("claude-opus-5-5");
    expect(c.body.temperature).toBeUndefined();
    expect(c.body.output_config).toEqual({ effort: "medium" });
    expect((c.body.tools as { eager_input_streaming: boolean; input_schema: { type: string } }[])[0]).toMatchObject({ eager_input_streaming: true, input_schema: { type: "object" } });
    expect(c.body.fallbacks).toBe("default");
    expect(c.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    // De SDK verstuurt de sleutel zelf (x-api-key of Authorization: Bearer, afhankelijk van de SDK-versie).
    expect(c.headers.get("x-api-key") ?? c.headers.get("authorization")).toContain("test-key-niet-echt");
  });

  it("voegt parallelle tool-resultaten samen in één gebruikersbericht", () => {
    const msgs = toAnthropicMessages([
      { role: "user", content: "x" },
      { role: "assistant", content: "", toolCalls: [{ id: "a", name: "t", input: {} }, { id: "b", name: "t", input: {} }] },
      { role: "tool", toolCallId: "a", name: "t", content: "1" },
      { role: "tool", toolCallId: "b", name: "t", content: "2", isError: true },
    ]);
    expect(msgs).toHaveLength(3);
    expect(msgs[2].role).toBe("user");
    expect((msgs[2].content as unknown[]).length).toBe(2);
  });

  it("vertaalt een ongeldige sleutel naar een duidelijke fout", async () => {
    const fetchMock = (async () => new Response(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }), { status: 401, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    await expect(collect(anthropicProvider.chatStream({ model: "claude-haiku-5-5", messages: [{ role: "user", content: "x" }] }, { apiKey: "fout", fetch: fetchMock }, caps))).rejects.toMatchObject({ code: "auth" });
  });
});

describe("OpenAI-adapter", () => {
  it("streamt tekst en voegt tool-call-fragmenten samen", async () => {
    let body: Record<string, unknown> = {};
    const chunk = (delta: unknown, finish: string | null = null) => `data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", created: 1, model: "gpt-5.5", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
    const fetchMock = (async (_url: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return sse([
        chunk({ role: "assistant", content: "Moment" }),
        chunk({ tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "calculator", arguments: '{"expr' } }] }),
        chunk({ tool_calls: [{ index: 0, function: { arguments: 'ession":"2*3"}' } }] }),
        chunk({}, "tool_calls"),
        `data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", created: 1, model: "gpt-5.5", choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })}\n\n`,
        "data: [DONE]\n\n",
      ]);
    }) as unknown as typeof fetch;
    const { text, result } = await collect(
      openaiProvider.chatStream(
        { model: "gpt-5.5", system: "S", messages: [{ role: "user", content: "x" }], tools: [{ name: "calculator", description: "d", inputSchema: { properties: {} } }], maxTokens: 100, temperature: 0.2 },
        { apiKey: "sk-test", fetch: fetchMock },
        { ...caps, supportsTemperature: false },
      ),
    );
    expect(text).toBe("Moment");
    expect(result.toolCalls).toEqual([{ id: "call_1", name: "calculator", input: { expression: "2*3" } }]);
    expect(result.stopReason).toBe("tool_use");
    expect(result.usage).toMatchObject({ inputTokens: 10, outputTokens: 5 });
    expect(body.temperature).toBeUndefined();
    expect(body.max_completion_tokens).toBe(100);
    expect(body.stream_options).toEqual({ include_usage: true });
  });
});

describe("Demo-simulator", () => {
  it("roept tools aan via /tool en vat resultaten samen", async () => {
    const tools = [{ name: "calculator", description: "x", inputSchema: { properties: { expression: { type: "string" } }, required: ["expression"] } }];
    const first = await collect(demoProvider.chatStream({ model: "demo-simulator", messages: [{ role: "user", content: '/tool calculator {"expression":"1+1"}' }], tools }, { apiKey: "demo" }, caps));
    expect(first.result.toolCalls[0]).toMatchObject({ name: "calculator", input: { expression: "1+1" } });
    const second = await collect(demoProvider.chatStream({ model: "demo-simulator", messages: [{ role: "user", content: "x" }, { role: "assistant", content: "", toolCalls: first.result.toolCalls }, { role: "tool", toolCallId: first.result.toolCalls[0].id, name: "calculator", content: "2" }], tools }, { apiKey: "demo" }, caps));
    expect(second.text).toContain("DEMO");
    expect(second.result.toolCalls).toHaveLength(0);
  });
  it("genereert JSON volgens schema, inclusief orchestratieplannen", () => {
    const plan = generateFromSchema({ type: "object", properties: { analysis: { type: "string" }, subtasks: { type: "array", items: { type: "object" } } } }, { agents: ["crm_agent", "offerte_agent"], topic: "test" }) as { subtasks: { agent_key: string; depends_on: string[] }[] };
    expect(plan.subtasks.map((s) => s.agent_key)).toEqual(["crm_agent", "offerte_agent"]);
    expect(plan.subtasks[1].depends_on).toEqual(["t1"]);
  });
  it("is altijd duidelijk gemarkeerd als demo", async () => {
    const r = await collect(demoProvider.chatStream({ model: "demo-simulator", messages: [{ role: "user", content: "Hallo" }] }, { apiKey: "demo" }, caps));
    expect(r.text.startsWith("[DEMO")).toBe(true);
  });
});

describe("ProviderError", () => {
  it("heeft een code voor gebruikersmeldingen", () => {
    expect(new ProviderError("openai", "rate_limit", "x").code).toBe("rate_limit");
  });
});
