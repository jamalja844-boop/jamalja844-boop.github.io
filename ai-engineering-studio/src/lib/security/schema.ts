import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";

const ajv = new Ajv({ allErrors: true, strict: false, coerceTypes: false, useDefaults: true });
addFormats(ajv);

const cache = new Map<string, ValidateFunction>();

function compile(schema: Record<string, unknown>): ValidateFunction {
  const key = JSON.stringify(schema);
  let fn = cache.get(key);
  if (!fn) {
    fn = ajv.compile(schema);
    if (cache.size > 500) cache.clear();
    cache.set(key, fn);
  }
  return fn;
}

/** Valideert waarde tegen JSON Schema. Retourneert leesbare foutmeldingen (Nederlands). */
export function validateAgainstSchema(schema: Record<string, unknown>, value: unknown): { valid: true } | { valid: false; errors: string[] } {
  let fn: ValidateFunction;
  try {
    fn = compile({ type: "object", ...schema });
  } catch (e) {
    return { valid: false, errors: [`Ongeldig schema: ${(e as Error).message}`] };
  }
  if (fn(value)) return { valid: true };
  const errors = (fn.errors ?? []).slice(0, 8).map((e) => {
    const path = e.instancePath ? e.instancePath.replace(/^\//, "").replace(/\//g, ".") : "invoer";
    switch (e.keyword) {
      case "required":
        return `ontbrekend veld: ${(e.params as { missingProperty: string }).missingProperty}`;
      case "additionalProperties":
        return `onbekend veld: ${(e.params as { additionalProperty: string }).additionalProperty}`;
      case "type":
        return `${path} moet van type ${(e.params as { type: string }).type} zijn`;
      case "enum":
        return `${path} moet een van ${JSON.stringify((e.params as { allowedValues: unknown[] }).allowedValues)} zijn`;
      default:
        return `${path}: ${e.message}`;
    }
  });
  return { valid: false, errors };
}

/** Controleert of een JSON-schema zelf geldig is (voor door gebruikers ingevoerde schema's). */
export function isValidSchema(schema: unknown): { ok: boolean; error?: string } {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return { ok: false, error: "Schema moet een JSON-object zijn" };
  try {
    ajv.compile(schema as Record<string, unknown>);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Probeert JSON uit modeluitvoer te halen (ook uit ```json-blokken). */
export function extractJson(text: string): { ok: true; value: unknown } | { ok: false } {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidates.push(fence[1].trim());
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(trimmed.slice(first, last + 1));
  for (const c of candidates) {
    try {
      return { ok: true, value: JSON.parse(c) };
    } catch {
      /* volgende kandidaat */
    }
  }
  return { ok: false };
}
