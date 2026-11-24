import { randomUUID } from "node:crypto";
import { z } from "zod";
import { json, withTenant, type TenantContext } from "@/lib/db";
import { ApiError } from "@/lib/api/errors";
import { runChat } from "@/lib/ai/service";
import { ProviderError } from "@/lib/ai/types";
import { extractJson, isValidSchema, validateAgainstSchema } from "@/lib/security/schema";
import { composeSystemPrompt, extractVariables, MissingVariablesError, renderTemplate, responseFormatFor, type PromptVersionData } from "@/lib/prompts/template";

export const variableSchema = z.object({
  name: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]{0,40}$/),
  description: z.string().max(300).optional(),
  default: z.string().max(5000).optional(),
  required: z.boolean().optional(),
});

export const versionSchema = z.object({
  role: z.string().max(5000).default(""),
  context: z.string().max(20000).default(""),
  goal: z.string().max(5000).default(""),
  system_prompt: z.string().max(40000).default(""),
  user_template: z.string().max(40000).default(""),
  variables: z.array(variableSchema).max(40).default([]),
  output_format: z.enum(["text", "markdown", "json", "json_schema"]).default("text"),
  output_schema: z.record(z.string(), z.unknown()).nullable().default(null),
  model_provider: z.string().max(30).nullable().default(null),
  model_id: z.string().max(120).nullable().default(null),
  temperature: z.number().min(0).max(2).nullable().default(null),
  notes: z.string().max(2000).default(""),
});

export type VersionInput = z.infer<typeof versionSchema>;

export function normalizeVersion(v: VersionInput): VersionInput {
  if (v.output_format === "json_schema") {
    if (!v.output_schema) throw new ApiError(400, "Geef een JSON-schema op voor gestructureerde uitvoer");
    const check = isValidSchema(v.output_schema);
    if (!check.ok) throw new ApiError(400, `Ongeldig JSON-schema: ${check.error}`);
  }
  // Variabelen: gedetecteerde namen aanvullen, onbekende behouden met metadata.
  const detected = extractVariables(v.system_prompt, v.user_template, v.role, v.context, v.goal);
  const vars = [...v.variables.filter((x) => detected.includes(x.name))];
  for (const name of detected) if (!vars.some((x) => x.name === name)) vars.push({ name, required: true });
  return { ...v, variables: vars };
}

export async function createVersion(ctx: TenantContext, promptId: string, input: VersionInput) {
  const v = normalizeVersion(input);
  return withTenant(ctx, async (tx) => {
    const [p] = await tx<{ id: string }[]>`select id from prompts where id = ${promptId} for update`;
    if (!p) throw new ApiError(404, "Prompt niet gevonden");
    const [{ next }] = await tx<{ next: number }[]>`select coalesce(max(version), 0) + 1 as next from prompt_versions where prompt_id = ${promptId}`;
    await tx`
      insert into prompt_versions (org_id, prompt_id, version, role, context, goal, system_prompt, user_template, variables, output_format,
        output_schema, model_provider, model_id, temperature, notes, created_by)
      values (app_org_id(), ${promptId}, ${next}, ${v.role}, ${v.context}, ${v.goal}, ${v.system_prompt}, ${v.user_template},
        ${json(tx, v.variables)}, ${v.output_format}, ${v.output_schema ? json(tx, v.output_schema) : null}, ${v.model_provider},
        ${v.model_id}, ${v.temperature}, ${v.notes}, app_user_id())`;
    await tx`update prompts set current_version = ${next}, updated_at = now() where id = ${promptId}`;
    return next;
  });
}

export interface TestVariant {
  version: number;
  provider: string;
  modelId: string;
}

/** Test één of meer promptvarianten naast elkaar en slaat de resultaten op. */
export async function runPromptTest(ctx: TenantContext, promptId: string, variants: TestVariant[], values: Record<string, string>) {
  const versions = await withTenant(ctx, (tx) => tx<(PromptVersionData & { version: number; temperature: string | null })[]>`
    select version, role, context, goal, system_prompt, user_template, variables, output_format, output_schema, temperature
      from prompt_versions where prompt_id = ${promptId} and version = any(${variants.map((v) => v.version)}::int[])`);
  const batchId = randomUUID();

  const results = await Promise.all(
    variants.map(async (variant) => {
      const v = versions.find((x) => x.version === variant.version);
      if (!v) return { variant, status: "failed" as const, error: `Versie ${variant.version} bestaat niet` };
      let system = "";
      let user = "";
      try {
        system = composeSystemPrompt(v, values);
        user = v.user_template.trim() ? renderTemplate(v.user_template, values, v.variables) : "Voer de opdracht uit.";
      } catch (e) {
        if (e instanceof MissingVariablesError) throw new ApiError(400, e.message);
        throw e;
      }
      const started = Date.now();
      let output = "";
      let outputJson: unknown = null;
      let jsonValid: boolean | null = null;
      let status: "succeeded" | "failed" = "succeeded";
      let error: string | null = null;
      let usage = { inputTokens: 0, outputTokens: 0 };
      let cost: number | null = 0;
      try {
        const r = await runChat({
          ctx,
          provider: variant.provider,
          modelId: variant.modelId,
          source: "prompt_test",
          refType: "prompt",
          refId: promptId,
          request: {
            system,
            messages: [{ role: "user", content: user }],
            maxTokens: 8000,
            temperature: v.temperature === null ? null : Number(v.temperature),
            responseFormat: responseFormatFor(v, "prompt_uitvoer"),
          },
        });
        output = r.text;
        usage = r.usage;
        cost = r.costUsd;
        if (v.output_format === "json" || v.output_format === "json_schema") {
          const parsed = extractJson(output);
          jsonValid = parsed.ok;
          if (parsed.ok) {
            outputJson = parsed.value;
            if (v.output_format === "json_schema" && v.output_schema) jsonValid = validateAgainstSchema(v.output_schema, parsed.value).valid;
          }
        }
      } catch (e) {
        status = "failed";
        error = e instanceof ProviderError || e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e);
      }
      const latency = Date.now() - started;
      const [row] = await withTenant(ctx, (tx) => tx<{ id: string }[]>`
        insert into prompt_test_runs (org_id, prompt_id, prompt_version, batch_id, provider, model_id, variables, rendered_system, rendered_user,
          output, output_json, json_valid, status, error, input_tokens, output_tokens, cost_usd, latency_ms, created_by)
        values (app_org_id(), ${promptId}, ${variant.version}, ${batchId}, ${variant.provider}, ${variant.modelId}, ${json(tx, values)},
          ${system}, ${user}, ${output}, ${outputJson === null ? null : json(tx, outputJson)}, ${jsonValid}, ${status}, ${error},
          ${usage.inputTokens}, ${usage.outputTokens}, ${cost}, ${latency}, app_user_id())
        returning id`);
      return { id: row.id, variant, status, error, output, outputJson, jsonValid, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costUsd: cost, latencyMs: latency, renderedSystem: system, renderedUser: user };
    }),
  );
  return { batchId, results };
}
