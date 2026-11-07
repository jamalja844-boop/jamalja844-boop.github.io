/**
 * CSV-import: zet een CSV-bestand om naar genormaliseerde producten.
 *
 * Formaat (zie public/voorbeeld/noblenest-voorbeeldcatalogus.csv en docs/CSV-FORMAAT.md):
 * - Eén regel per variant. Regels met dezelfde external_id vormen samen één product.
 * - Kolomnamen in het Engels of Nederlands (bv. "title" of "titel").
 * - Scheidingsteken komma, puntkomma of tab wordt automatisch herkend.
 * - Bedragen in Nederlandse (12,50) of internationale (12.50) notatie.
 */
import Papa from "papaparse";
import type { ParseResult, RowError } from "./types";
import { NAME_TO_FIELD, normalizeHeader, recordFromNamedValues, toParseResult, type NormalizeOptions } from "./normalize";

export { normalizeHeader } from "./normalize";

export interface CsvParseOptions extends NormalizeOptions {
  maxRows?: number;
}

type Row = Record<string, string>;

export function parseProductCsv(text: string, options: CsvParseOptions): ParseResult {
  const parsed = Papa.parse<Row>(text.replace(/^\uFEFF/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: normalizeHeader,
  });

  const headers = parsed.meta.fields ?? [];
  const known = new Set(headers.map((h) => NAME_TO_FIELD.get(h)).filter(Boolean));
  if (!known.has("external_id") || !known.has("title")) {
    return {
      products: [],
      totalRows: 0,
      errors: [{ row: 1, message: "Verplichte kolommen ontbreken: external_id en title (of externe_id en titel)." }],
    };
  }

  const formatErrors: RowError[] = [];
  for (const e of parsed.errors) {
    // Papa meldt o.a. regels met afwijkend aantal kolommen
    if (e.type === "Delimiter") continue;
    formatErrors.push({ row: (e.row ?? 0) + 2, message: `CSV-opmaak: ${translatePapaError(e.code)}` });
  }

  // Regel 1 = kopregel, dus gegevensregel i staat op regel i + 2.
  const records = parsed.data.map((row, index) => recordFromNamedValues(index + 2, row));
  return toParseResult(records, options, formatErrors, options.maxRows ?? 5000);
}

function translatePapaError(code: string): string {
  switch (code) {
    case "TooFewFields":
      return "te weinig kolommen op deze regel";
    case "TooManyFields":
      return "te veel kolommen op deze regel";
    case "MissingQuotes":
      return "aanhalingsteken niet afgesloten";
    default:
      return code;
  }
}
