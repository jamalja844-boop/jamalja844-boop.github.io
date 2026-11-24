import { createHash } from "node:crypto";
import type { ChatRequest, ChatResult, LLMProvider, StreamEvent, ToolCall } from "@/lib/ai/types";

/**
 * DEMO-SIMULATOR – geen echte AI.
 *
 * Bedoeld om de volledige applicatie (chat, tools, agents, workflows) lokaal en in
 * automatische tests te kunnen doorlopen zonder API-sleutels. Elk antwoord is
 * duidelijk gemarkeerd als demo. Alleen actief met ENABLE_DEMO_PROVIDER=true.
 *
 * Gedrag (deterministisch):
 *  - "/tool <naam> {json}" of "gebruik tool <naam>" → roept die tool aan.
 *  - Meerdere regels "/tool <naam> {json}" → voert ze als script na elkaar uit
 *    (één tool-call per beurt), daarna een samenvatting.
 *  - Na een tool-resultaat → vat het resultaat samen.
 *  - E-mailopdracht (instructie "Onderwerp: …") → e-mail met onderwerpregel.
 *  - JSON-schema gevraagd → geldig object volgens het schema.
 *  - Anders → herhaalt de vraag met uitleg.
 */
export const DEMO_PREFIX = "[DEMO – geen echte AI]";

const estimateTokens = (s: string) => Math.max(1, Math.ceil(s.length / 4));

function lastOf<T>(arr: T[]): T | undefined {
  return arr[arr.length - 1];
}

type Schema = { type?: string | string[]; properties?: Record<string, Schema>; items?: Schema; enum?: unknown[]; required?: string[]; minItems?: number; description?: string };

export function generateFromSchema(schema: Schema, ctx: { agents: string[]; topic: string; path?: string }): unknown {
  const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== "null") : schema.type;
  if (schema.enum?.length) return schema.enum[0];
  const name = ctx.path ?? "";
  switch (type) {
    case "object": {
      const out: Record<string, unknown> = {};
      for (const [key, sub] of Object.entries(schema.properties ?? {})) {
        if (key === "subtasks" && (sub.type === "array" || sub.items)) {
          const agents = ctx.agents.length ? ctx.agents.slice(0, 2) : ["algemeen"];
          out[key] = agents.map((agent, i) => ({
            id: `t${i + 1}`,
            title: `Deeltaak ${i + 1}: ${ctx.topic.slice(0, 60)}`,
            instructions: `${DEMO_PREFIX} Voer deel ${i + 1} uit van: ${ctx.topic}`,
            agent_key: agent,
            depends_on: i === 0 ? [] : ["t1"],
          }));
          continue;
        }
        out[key] = generateFromSchema(sub, { ...ctx, path: key });
      }
      return out;
    }
    case "array": {
      const n = Math.max(1, schema.minItems ?? 1);
      return Array.from({ length: n }, () => generateFromSchema(schema.items ?? { type: "string" }, ctx));
    }
    case "integer":
    case "number":
      return /score|confidence|zekerheid/i.test(name) ? 0.5 : 1;
    case "boolean":
      return /met|ok|valid|geslaagd|achieved|goal|pass/i.test(name);
    case "string":
    default:
      if (/agent/i.test(name) && ctx.agents[0]) return ctx.agents[0];
      return `${DEMO_PREFIX} ${name || "waarde"} voor: ${ctx.topic.slice(0, 80)}`;
  }
}

function pickToolCall(req: ChatRequest, text: string): ToolCall | null {
  if (!req.tools?.length) return null;
  const m = text.match(/(?:\/tool|gebruik(?:\s+de)?\s+tool)\s+([a-z][a-z0-9_]*)\s*(\{[\s\S]*\})?/i);
  if (!m) return null;
  const tool = req.tools.find((t) => t.name === m[1]);
  if (!tool) return null;
  let input: Record<string, unknown> = {};
  if (m[2]) {
    try {
      input = JSON.parse(m[2]);
    } catch {
      input = {};
    }
  } else {
    const props = (tool.inputSchema.properties ?? {}) as Record<string, Schema>;
    const rest = text.slice((m.index ?? 0) + m[0].length).trim() || text;
    for (const [k, s] of Object.entries(props)) {
      if ((tool.inputSchema.required as string[] | undefined)?.includes(k)) {
        input[k] = s.type === "number" || s.type === "integer" ? 5 : s.enum?.[0] ?? rest.slice(0, 200);
      }
    }
  }
  const id = "demo_" + createHash("sha1").update(text + tool.name).digest("hex").slice(0, 12);
  return { id, name: tool.name, input };
}

/** Script: alle regels "/tool naam {json}" uit het laatste gebruikersbericht (JSON op één regel). */
export function parseToolScript(text: string): { name: string; input: Record<string, unknown> }[] {
  const out: { name: string; input: Record<string, unknown> }[] = [];
  for (const line of text.split("\n")) {
    const m = line.trim().match(/^\/tool\s+([a-z][a-z0-9_]*)\s*(\{.*\})?\s*$/i);
    if (!m) continue;
    let input: Record<string, unknown> = {};
    if (m[2]) {
      try {
        input = JSON.parse(m[2]);
      } catch {
        input = {};
      }
    }
    out.push({ name: m[1], input });
  }
  return out;
}

function scriptedCall(req: ChatRequest): ToolCall | null | "done" {
  if (!req.tools?.length) return null;
  const lastUserIdx = req.messages.map((m) => m.role).lastIndexOf("user");
  if (lastUserIdx < 0) return null;
  const script = parseToolScript(req.messages[lastUserIdx].content).filter((s) => req.tools!.some((t) => t.name === s.name));
  if (script.length < 2) return null;
  const done = req.messages.slice(lastUserIdx + 1).filter((m) => m.role === "assistant" && m.toolCalls?.length).length;
  if (done >= script.length) return "done";
  const step = script[done];
  const id = "demo_" + createHash("sha1").update(`${done}:${step.name}:${JSON.stringify(step.input)}`).digest("hex").slice(0, 12);
  return { id, name: step.name, input: step.input };
}

function buildResponse(req: ChatRequest): { text: string; toolCalls: ToolCall[] } {
  const last = lastOf(req.messages);
  const system = req.system ?? "";
  const agents = [...system.matchAll(/^- ([a-z][a-z0-9_]+)\b/gm)].map((m) => m[1]);
  const userTexts = req.messages.filter((m) => m.role === "user").map((m) => m.content);
  const topic = lastOf(userTexts) ?? "de opdracht";
  // Gemarkeerde data (bijlagen, geplakte tekst) niet letterlijk herhalen in demo-antwoorden.
  const dataBlocks = (topic.match(/<<<BEGIN /g) ?? []).length;
  const cleanTopic = topic
    .replace(/<<<BEGIN[\s\S]*?<<<EINDE[^>]*>>>/g, " ")
    .replace(/(Bijlagen[^:\n]*:|Tekst uit de bijlage\(n\):|Tekst:|Gebruik het vorige antwoord als tekst\.)/g, " ")
    .replace(/Antwoord alleen met JSON[^\n]*/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "de meegestuurde tekst";

  const scripted = scriptedCall(req);
  if (scripted && scripted !== "done") return { text: `${DEMO_PREFIX} Stap: tool \`${scripted.name}\`.`, toolCalls: [scripted] };

  if (last?.role === "tool") {
    const results = req.messages.slice(-5).filter((m) => m.role === "tool") as Extract<ChatRequest["messages"][number], { role: "tool" }>[];
    const summary = results
      .map((r) => `• Tool \`${r.name}\`${r.isError ? " (fout)" : ""}: ${r.content.replace(/<<<[^>]*>>>/g, "").trim().slice(0, 500)}`)
      .join("\n");
    return { text: `${DEMO_PREFIX}\nIk heb de tool uitgevoerd. Resultaat:\n${summary}`, toolCalls: [] };
  }

  if (last?.role === "user") {
    const call = pickToolCall(req, last.content);
    if (call) return { text: `${DEMO_PREFIX} Ik roep de tool \`${call.name}\` aan.`, toolCalls: [call] };
  }

  if (/"Onderwerp: …"/.test(system) && last?.role === "user") {
    const ask = cleanTopic;
    const subject = ask.replace(/^(schrijf\s+)?(een\s+)?(e-?mail\s+)?/i, "").slice(0, 70) || "Uw aanvraag";
    return {
      text:
        `${DEMO_PREFIX}\nOnderwerp: ${subject.charAt(0).toUpperCase()}${subject.slice(1)}\n\nBeste klant,\n\n` +
        `Bedankt voor uw bericht. Dit is een gesimuleerde e-mail op basis van de opdracht: "${ask.slice(0, 300)}".\n\n` +
        `Met vriendelijke groet,\n\n(Demo-tekst: koppel een AI-provider onder Instellingen → AI-providers voor een echte e-mail.)`,
      toolCalls: [],
    };
  }

  if (req.responseFormat?.type === "json_schema") {
    return { text: JSON.stringify(generateFromSchema(req.responseFormat.schema as Schema, { agents, topic: cleanTopic })), toolCalls: [] };
  }
  if (req.responseFormat?.type === "json") {
    return { text: JSON.stringify({ demo: true, antwoord: `${DEMO_PREFIX} ${cleanTopic.slice(0, 200)}` }), toolCalls: [] };
  }

  const sources = [...system.matchAll(/\[Bron (\d+)\]/g)].map((m) => `[Bron ${m[1]}]`);
  const sourceLine = sources.length
    ? `\n\nIn de kennisbank zijn ${new Set(sources).size} relevante fragmenten gevonden: ${[...new Set(sources)].join(", ")}.`
    : "";
  return {
    text:
      `${DEMO_PREFIX}\nJe bericht: "${cleanTopic.slice(0, 400)}"` +
      (dataBlocks ? `\n\nMeegestuurde data: ${dataBlocks} gemarkeerd tekstblok(ken), bijv. bijlagen. Een echt AI-model leest en verwerkt deze inhoud.` : "") +
      sourceLine +
      `\n\nDit is een gesimuleerd antwoord om de applicatie te testen. Stel een Anthropic- of OpenAI-sleutel in onder Instellingen → AI-providers voor echte antwoorden.`,
    toolCalls: [],
  };
}

/** Deterministische, genormaliseerde hash-embedding (lexicale overlap). Geen echte semantiek. */
export function demoEmbedding(text: string, dims = 1536): number[] {
  const v = new Array<number>(dims).fill(0);
  const words = text.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 2);
  for (const w of words) {
    const h = createHash("md5").update(w).digest();
    const idx = h.readUInt32LE(0) % dims;
    v[idx] += h[4] & 1 ? 1 : -1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

export const demoProvider: LLMProvider = {
  id: "demo",
  name: "Demo-simulator",
  requiresKey: false,

  async *chatStream(req: ChatRequest): AsyncGenerator<StreamEvent> {
    const { text, toolCalls } = buildResponse(req);
    for (let i = 0; i < text.length; i += 24) {
      if (req.signal?.aborted) break;
      yield { type: "text", delta: text.slice(i, i + 24) };
      await new Promise((r) => setTimeout(r, 4));
    }
    for (const call of toolCalls) yield { type: "tool_call", call };
    const inputText = (req.system ?? "") + req.messages.map((m) => m.content).join("\n");
    const result: ChatResult = {
      text,
      toolCalls,
      usage: { inputTokens: estimateTokens(inputText), outputTokens: estimateTokens(text) },
      stopReason: toolCalls.length ? "tool_use" : "end",
      model: req.model,
      notes: ["Demo-simulator: geen echte AI"],
    };
    yield { type: "done", result };
  },

  async listModels() {
    return [
      { id: "demo-simulator", displayName: "Demo-simulator (geen echte AI)", kind: "chat" },
      { id: "demo-embedding", displayName: "Demo-embedding (hash, geen echte AI)", kind: "embedding" },
    ];
  },

  async embed(texts) {
    return {
      vectors: texts.map((t) => demoEmbedding(t)),
      usage: { inputTokens: texts.reduce((s, t) => s + estimateTokens(t), 0), outputTokens: 0 },
    };
  },
};
