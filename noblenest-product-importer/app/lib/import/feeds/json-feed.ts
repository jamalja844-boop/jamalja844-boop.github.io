/**
 * JSON-productfeed (Noblenest-formaat).
 *
 * {
 *   "products": [
 *     {
 *       "external_id": "LAMP-1", "title": "Messing wandlamp", "currency": "EUR", "cost_price": 24.5,
 *       "image_urls": ["https://…"], "image_rights": true, "options": ["Kleur"],
 *       "variants": [ { "sku": "LAMP-1-GD", "option_values": ["Goud"], "stock_quantity": 12 } ]
 *     }
 *   ]
 * }
 *
 * - Een array op het hoogste niveau mag ook. Veldnamen in het Engels of Nederlands (zoals bij CSV).
 * - option_values mag een lijst zijn (volgorde van "options") of een object { "Kleur": "Goud" }.
 */
import type { ParseResult, RowError } from "../types";
import { recordFromNamedValues, toParseResult, type NormalizeOptions, type SourceRecord } from "../normalize";

export interface JsonFeedParseOptions extends NormalizeOptions {
  maxRows?: number;
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export function parseJsonFeed(text: string, options: JsonFeedParseOptions): ParseResult {
  let doc: Json;
  try {
    doc = JSON.parse(text.replace(/^\uFEFF/, "")) as Json;
  } catch (error) {
    return fail(`Ongeldige JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const list = Array.isArray(doc) ? doc : isObject(doc) && Array.isArray(doc.products) ? doc.products : isObject(doc) && Array.isArray(doc.producten) ? doc.producten : null;
  if (!list) return fail('Geen producten gevonden: verwacht { "products": [ … ] } of een lijst met producten.');

  const records: SourceRecord[] = [];
  const errors: RowError[] = [];
  let row = 0;

  list.forEach((entry, index) => {
    const itemNo = index + 1;
    if (!isObject(entry)) {
      errors.push({ row: itemNo, message: `Product ${itemNo} is geen object.` });
      return;
    }
    const productFields: Record<string, string> = {};
    let variants: Json[] = [];
    let optionNames: string[] = [];
    for (const [key, value] of Object.entries(entry)) {
      const k = key.toLowerCase();
      if (k === "variants" || k === "varianten") variants = Array.isArray(value) ? value : [];
      else if (k === "options" || k === "opties") optionNames = Array.isArray(value) ? value.map((v) => String(v)) : [];
      else {
        const s = scalar(value);
        if (s !== undefined) productFields[key] = s;
      }
    }
    optionNames.slice(0, 3).forEach((name, i) => (productFields[`option${i + 1}_name`] = name));

    if (variants.length === 0) {
      records.push(recordFromNamedValues(++row, productFields));
      return;
    }
    variants.forEach((variant, vIndex) => {
      if (!isObject(variant)) {
        errors.push({ row: itemNo, message: `Product ${itemNo}: variant ${vIndex + 1} is geen object.` });
        return;
      }
      const fields: Record<string, string> = vIndex === 0 ? { ...productFields } : pick(productFields, ["external_id", "externe_id", "option1_name", "option2_name", "option3_name", "currency", "valuta"]);
      for (const [key, value] of Object.entries(variant)) {
        const k = key.toLowerCase();
        if (k === "option_values" || k === "optiewaarden") {
          const values = Array.isArray(value)
            ? value.map((v) => String(v))
            : isObject(value)
              ? optionNames.map((n) => (value[n] === undefined ? "" : String(value[n])))
              : [];
          values.slice(0, 3).forEach((v, i) => (fields[`option${i + 1}_value`] = v));
        } else if (k === "cost_price" || k === "inkoopprijs") {
          const s = scalar(value);
          if (s !== undefined) fields.variant_cost_price = s;
        } else if (k === "image_url" || k === "afbeelding") {
          const s = scalar(value);
          if (s !== undefined) fields.variant_image_url = s;
        } else {
          const s = scalar(value);
          if (s !== undefined) fields[key] = s;
        }
      }
      records.push(recordFromNamedValues(++row, fields));
    });
  });

  return toParseResult(records, options, errors, options.maxRows ?? 5000);
}

function fail(message: string): ParseResult {
  return { products: [], totalRows: 0, errors: [{ row: 1, message }] };
}

function isObject(value: Json): value is { [key: string]: Json } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Zet een JSON-waarde om naar tekst; lijsten worden met "|" samengevoegd (afbeeldingen, tags). */
function scalar(value: Json): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "boolean") return value ? "ja" : "nee";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : undefined;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((v) => (typeof v === "string" || typeof v === "number" ? String(v) : "")).filter(Boolean).join("|");
  return undefined;
}

function pick(obj: Record<string, string>, keys: string[]): Record<string, string> {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => keys.includes(k.toLowerCase())));
}
