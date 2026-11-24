import { describe, expect, it } from "vitest";
import { calculate } from "@/lib/tools/calculator";
import { chunkSections } from "@/lib/rag/chunk";
import { detectType, verifyMagic } from "@/lib/rag/extract";
import { composeSystemPrompt, extractVariables, MissingVariablesError, renderTemplate, responseFormatFor } from "@/lib/prompts/template";
import { classifyOpenAiModel, computeCost, MODEL_CATALOG } from "@/lib/ai/catalog";
import { validateGraph, renderWorkflowTemplate, type Graph } from "@/lib/workflows/engine";
import { validatePlan } from "@/lib/orchestrator/engine";
import { needsApproval } from "@/lib/tools/executor";
import { BUILTIN_TOOLS } from "@/lib/tools/definitions";
import { isValidSchema } from "@/lib/security/schema";
import { CLEAN_AGENTS } from "@/lib/templates/clean";

describe("rekenmachine-tool", () => {
  it("rekent exact, inclusief komma's en procenten", () => {
    expect(calculate("120 * 4,5 * 1.21")).toBe(653.4);
    expect(calculate("(10 + 5) * 2")).toBe(30);
    expect(calculate("200 * 21%")).toBe(42);
    expect(calculate("2 ^ 3 ^ 2")).toBe(512);
    expect(calculate("-3 + 5")).toBe(2);
  });
  it("weigert code en ongeldige invoer", () => {
    expect(() => calculate("process.exit()")).toThrow();
    expect(() => calculate("1 / 0")).toThrow(/nul/);
    expect(() => calculate("(1 + 2")).toThrow(/haakje/);
    expect(() => calculate("1..2 + 3")).toThrow();
  });
});

describe("RAG: chunking en bestandscontrole", () => {
  it("deelt tekst op met overlap en behoudt paginanummers", () => {
    const text = Array.from({ length: 40 }, (_, i) => `Dit is zin nummer ${i} over kantoorschoonmaak en kwaliteit.`).join(" ");
    const chunks = chunkSections([{ text, page: 3 }], 400, 80);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.every((c) => c.page === 3 && c.content.length <= 400)).toBe(true);
    const joined = chunks.map((c) => c.content).join(" ");
    expect(joined).toContain("zin nummer 39");
  });
  it("herkent bestandstypes en vervalste inhoud", () => {
    expect(detectType("offerte.PDF", "")).toBe("pdf");
    expect(detectType("x.exe", "application/octet-stream")).toBeNull();
    expect(verifyMagic("pdf", Buffer.from("%PDF-1.7 ..."))).toBe(true);
    expect(verifyMagic("pdf", Buffer.from("MZ binair"))).toBe(false);
    expect(verifyMagic("txt", Buffer.from([0x41, 0x00, 0x42]))).toBe(false);
  });
});

describe("prompt-templates", () => {
  const v = {
    role: "Offertespecialist", context: "Klant: {{klant}}", goal: "Offerte maken", system_prompt: "Wees precies.",
    user_template: "Maak een offerte voor {{klant}} ({{m2}} m²)", variables: [{ name: "klant", required: true }, { name: "m2", default: "100" }],
    output_format: "json_schema" as const, output_schema: { type: "object" },
  };
  it("detecteert variabelen", () => expect(extractVariables(v.user_template, v.context).sort()).toEqual(["klant", "m2"]));
  it("vult variabelen in met standaardwaarden", () => expect(renderTemplate(v.user_template, { klant: "Zeist BV" }, v.variables)).toBe("Maak een offerte voor Zeist BV (100 m²)"));
  it("meldt ontbrekende verplichte variabelen", () => expect(() => renderTemplate(v.user_template, {}, v.variables)).toThrow(MissingVariablesError));
  it("stelt de systeemprompt samen uit rol, context, doel en formaat", () => {
    const s = composeSystemPrompt(v, { klant: "Zeist BV" });
    expect(s).toContain("## Rol\nOffertespecialist");
    expect(s).toContain("Klant: Zeist BV");
    expect(s).toContain("## Uitvoerformaat");
    expect(responseFormatFor(v)).toEqual({ type: "json_schema", name: "uitvoer", schema: { type: "object" } });
  });
});

describe("modelcatalogus en kosten", () => {
  it("berekent kosten per miljoen tokens en meldt onbekende prijzen", () => {
    expect(computeCost({ inputTokens: 1_000_000, outputTokens: 500_000 }, { inputPrice: 4, outputPrice: 20 })).toBe(14);
    expect(computeCost({ inputTokens: 10, outputTokens: 10 }, { inputPrice: null, outputPrice: 1 })).toBeNull();
  });
  it("classificeert OpenAI-modellen uit de modellen-API", () => {
    expect(classifyOpenAiModel("text-embedding-3-small")).toMatchObject({ kind: "embedding", usable: true });
    expect(classifyOpenAiModel("whisper-1").usable).toBe(false);
    expect(classifyOpenAiModel("gpt-5.5").supportsTemperature).toBe(false);
  });
  it("biedt Claude-modellen standaard aan zonder temperature (niet ondersteund)", () => {
    const seeded = MODEL_CATALOG.filter((m) => m.provider === "anthropic" && m.seed);
    expect(seeded.map((m) => m.modelId)).toContain("claude-opus-5-5");
    expect(seeded.every((m) => !m.supportsTemperature)).toBe(true);
  });
});

describe("tooldefinities", () => {
  it("hebben geldige input- en outputschema's", () => {
    for (const t of BUILTIN_TOOLS) {
      expect(isValidSchema(t.inputSchema).ok, t.key).toBe(true);
      expect(isValidSchema(t.outputSchema).ok, t.key).toBe(true);
    }
  });
  it("vereisen goedkeuring voor gevoelige acties", () => {
    for (const t of BUILTIN_TOOLS.filter((x) => x.riskLevel === "sensitive")) expect(needsApproval({ handler: t.handler, risk_level: t.riskLevel, requires_approval: t.requiresApproval }, {}), t.key).toBe(true);
    expect(needsApproval({ handler: "http_request", risk_level: "write", requires_approval: true }, { method: "GET" })).toBe(false);
    expect(needsApproval({ handler: "http_request", risk_level: "write", requires_approval: true }, { method: "DELETE" })).toBe(true);
  });
});

describe("workflows en orchestratie", () => {
  const g: Graph = {
    nodes: [
      { id: "s", type: "start", position: { x: 0, y: 0 }, data: {} },
      { id: "a", type: "llm", position: { x: 0, y: 0 }, data: { provider: "demo", modelId: "demo-simulator" } },
    ],
    edges: [{ id: "e", source: "s", target: "a" }],
  };
  it("accepteert een geldige graaf en weigert cycli of meerdere starts", () => {
    expect(validateGraph(g)).toEqual([]);
    expect(validateGraph({ ...g, edges: [...g.edges, { id: "x", source: "a", target: "s" }] }).join()).toMatch(/cyclus/);
    expect(validateGraph({ ...g, nodes: [...g.nodes, { id: "s2", type: "start", position: { x: 0, y: 0 }, data: {} }] }).join()).toMatch(/startnode/);
  });
  it("vult workflowtemplates in", () => {
    expect(renderWorkflowTemplate("{{input.klant}} – {{prev}} – {{node.a}}", { klant: "K" }, { a: { text: "uit A" } }, "vorige")).toBe("K – vorige – uit A");
  });
  it("valideert orchestratieplannen (agents, ID's, afhankelijkheden)", () => {
    const ok = validatePlan({ analysis: "x", subtasks: [{ id: "t1", title: "a", instructions: "b", agent_key: "crm_agent", depends_on: [] }, { id: "t2", title: "c", instructions: "d", agent_key: "offerte_agent", depends_on: ["t1"] }] }, ["crm_agent", "offerte_agent"]);
    expect(ok.ok).toBe(true);
    expect(validatePlan({ subtasks: [{ id: "t1", title: "a", instructions: "b", agent_key: "onbekend", depends_on: [] }] }, ["crm_agent"]).ok).toBe(false);
    expect(validatePlan({ subtasks: [{ id: "t1", title: "a", instructions: "b", agent_key: "crm_agent", depends_on: ["t2"] }] }, ["crm_agent"]).ok).toBe(false);
  });
});

describe("Clean-sjabloonpakket", () => {
  it("bevat precies zestien unieke agents met tools en datascopes", () => {
    expect(CLEAN_AGENTS).toHaveLength(16);
    expect(new Set(CLEAN_AGENTS.map((a) => a.key)).size).toBe(16);
    const toolKeys = new Set(BUILTIN_TOOLS.map((t) => t.key));
    for (const a of CLEAN_AGENTS) {
      expect(a.toolKeys.length, a.key).toBeGreaterThan(0);
      for (const k of a.toolKeys) expect(toolKeys.has(k), `${a.key}:${k}`).toBe(true);
    }
  });
  it("deelt HR-gegevens niet met alle agents", () => {
    const hr = CLEAN_AGENTS.find((a) => a.key === "hr_agent")!;
    expect(hr.shareWith).not.toContain("*");
    expect(hr.clearance).toBe("admin");
  });
});
