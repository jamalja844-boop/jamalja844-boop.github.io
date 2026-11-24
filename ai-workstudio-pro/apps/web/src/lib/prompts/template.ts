import type { ResponseFormat } from "@/lib/ai/types";

export interface PromptVariable {
  name: string;
  description?: string;
  default?: string;
  required?: boolean;
}

export interface PromptVersionData {
  role: string;
  context: string;
  goal: string;
  system_prompt: string;
  user_template: string;
  variables: PromptVariable[];
  output_format: "text" | "markdown" | "json" | "json_schema";
  output_schema: Record<string, unknown> | null;
}

const VAR_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]{0,40})\s*\}\}/g;

export function extractVariables(...texts: string[]): string[] {
  const names = new Set<string>();
  for (const t of texts) for (const m of t.matchAll(VAR_RE)) names.add(m[1]);
  return [...names];
}

export class MissingVariablesError extends Error {
  constructor(public missing: string[]) {
    super(`Vul de verplichte variabelen in: ${missing.join(", ")}`);
  }
}

/** Vervangt {{variabelen}}; ontbrekende verplichte variabelen geven een fout. */
export function renderTemplate(template: string, values: Record<string, string>, variables: PromptVariable[] = []): string {
  const missing: string[] = [];
  const out = template.replace(VAR_RE, (_m, name: string) => {
    const def = variables.find((v) => v.name === name);
    const val = values[name] ?? def?.default ?? "";
    if (!val && (def?.required ?? true)) missing.push(name);
    return val;
  });
  if (missing.length) throw new MissingVariablesError([...new Set(missing)]);
  return out;
}

const FORMAT_TEXT: Record<PromptVersionData["output_format"], string> = {
  text: "",
  markdown: "Gebruik Markdown met duidelijke koppen en opsommingen.",
  json: "Antwoord uitsluitend met één geldig JSON-object.",
  json_schema: "Antwoord uitsluitend met één JSON-object dat exact voldoet aan het opgegeven schema.",
};

/** Stelt de systeemprompt samen uit de visuele onderdelen van een promptversie. */
export function composeSystemPrompt(v: PromptVersionData, values: Record<string, string> = {}): string {
  const r = (t: string) => (t ? renderTemplate(t, values, v.variables.map((x) => ({ ...x, required: false }))) : "");
  const parts: string[] = [];
  if (v.system_prompt.trim()) parts.push(r(v.system_prompt.trim()));
  if (v.role.trim()) parts.push(`## Rol\n${r(v.role.trim())}`);
  if (v.context.trim()) parts.push(`## Context\n${r(v.context.trim())}`);
  if (v.goal.trim()) parts.push(`## Doel\n${r(v.goal.trim())}`);
  const fmt = FORMAT_TEXT[v.output_format];
  if (fmt) parts.push(`## Uitvoerformaat\n${fmt}`);
  return parts.join("\n\n");
}

export function responseFormatFor(v: Pick<PromptVersionData, "output_format" | "output_schema">, name = "uitvoer"): ResponseFormat {
  if (v.output_format === "json_schema" && v.output_schema) return { type: "json_schema", name, schema: v.output_schema };
  if (v.output_format === "json") return { type: "json" };
  return { type: "text" };
}
