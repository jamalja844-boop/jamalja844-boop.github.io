/**
 * Adapterinterface voor importbronnen.
 *
 * Elke bron (bestand, feed, leveranciers-API) levert hetzelfde genormaliseerde resultaat.
 * Nieuwe leveranciersadapters (bv. AliExpress Open Platform) implementeren dezelfde vorm
 * zodra er toegestane API-toegang is.
 */
import { parseProductCsv } from "./csv";
import { parseGoogleXmlFeed } from "./feeds/google-xml";
import { parseJsonFeed } from "./feeds/json-feed";
import type { NormalizeOptions } from "./normalize";
import type { ParseResult } from "./types";

export type SourceFormat = "CSV" | "XML" | "JSON";

export const SUPPLIER_KEY_FOR_FORMAT: Record<SourceFormat, string> = {
  CSV: "csv",
  XML: "xml-feed",
  JSON: "json-feed",
};

export interface ParseSourceOptions extends NormalizeOptions {
  maxRows?: number;
}

export function parseSource(format: SourceFormat, text: string, options: ParseSourceOptions): ParseResult {
  switch (format) {
    case "CSV":
      return parseProductCsv(text, options);
    case "XML":
      return parseGoogleXmlFeed(text, options);
    case "JSON":
      return parseJsonFeed(text, options);
  }
}

/** Bepaalt het formaat aan de hand van de bestandsnaam en (als vangnet) de inhoud. */
export function detectFormat(fileName: string, text: string): SourceFormat | null {
  const name = fileName.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt")) return "CSV";
  if (name.endsWith(".xml") || name.endsWith(".rss")) return "XML";
  if (name.endsWith(".json")) return "JSON";
  const start = text.replace(/^\uFEFF/, "").trimStart()[0];
  if (start === "<") return "XML";
  if (start === "{" || start === "[") return "JSON";
  return null;
}

/** Contract voor (toekomstige) leveranciersadapters met een officiële API. */
export interface SupplierAdapter {
  key: string;
  /** Controleert of de verbinding/credentials werken. */
  checkConnection(): Promise<{ ok: boolean; message: string; productCount?: number }>;
  /** Haalt (een deel van) de catalogus op als genormaliseerd resultaat. */
  fetchCatalog(options: ParseSourceOptions): Promise<ParseResult>;
}
