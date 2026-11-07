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
import { sanitizeDescription } from "./html";
import {
  cleanText,
  parseBoolean,
  parseDecimal,
  parseInteger,
  parsePublicHttpsUrl,
  splitList,
  splitTags,
  ValueError,
} from "./values";
import {
  normalizedProductSchema,
  type NormalizedImage,
  type NormalizedProduct,
  type NormalizedVariant,
  type ParseResult,
  type RowError,
  type StockStatus,
} from "./types";

type Field =
  | "external_id" | "title" | "description" | "vendor" | "brand" | "product_type" | "tags"
  | "source_url" | "gtin" | "currency" | "cost_price" | "variant_cost_price" | "shipping_cost"
  | "delivery_days_min" | "delivery_days_max" | "stock_quantity" | "stock_status" | "variant_id"
  | "sku" | "barcode" | "option1_name" | "option1_value" | "option2_name" | "option2_value"
  | "option3_name" | "option3_value" | "weight_grams" | "image_urls" | "variant_image_url"
  | "image_alt" | "image_rights" | "safety_info" | "eu_responsible_person" | "country_of_origin";

const ALIASES: Record<Field, string[]> = {
  external_id: ["external_id", "externe_id", "product_id", "leverancier_product_id", "supplier_product_id"],
  title: ["title", "titel", "naam", "productnaam", "product_name", "name"],
  description: ["description", "beschrijving", "omschrijving", "body_html"],
  vendor: ["vendor", "leverancier", "verkoper"],
  brand: ["brand", "merk"],
  product_type: ["product_type", "producttype", "categorie", "category"],
  tags: ["tags", "labels"],
  source_url: ["source_url", "bron_url", "product_url", "leverancier_url"],
  gtin: ["gtin", "ean"],
  currency: ["currency", "valuta"],
  cost_price: ["cost_price", "inkoopprijs", "kostprijs", "purchase_price"],
  variant_cost_price: ["variant_cost_price", "variant_inkoopprijs"],
  shipping_cost: ["shipping_cost", "verzendkosten"],
  delivery_days_min: ["delivery_days_min", "levertijd_min", "levertijd_min_dagen"],
  delivery_days_max: ["delivery_days_max", "levertijd_max", "levertijd_max_dagen"],
  stock_quantity: ["stock_quantity", "voorraad", "stock", "inventory"],
  stock_status: ["stock_status", "voorraadstatus", "beschikbaarheid"],
  variant_id: ["variant_id", "variant_externe_id"],
  sku: ["sku", "artikelnummer"],
  barcode: ["barcode", "variant_ean", "variant_gtin"],
  option1_name: ["option1_name", "optie1_naam"],
  option1_value: ["option1_value", "optie1_waarde"],
  option2_name: ["option2_name", "optie2_naam"],
  option2_value: ["option2_value", "optie2_waarde"],
  option3_name: ["option3_name", "optie3_naam"],
  option3_value: ["option3_value", "optie3_waarde"],
  weight_grams: ["weight_grams", "gewicht_gram", "gewicht"],
  image_urls: ["image_urls", "afbeeldingen", "images", "image_url", "afbeelding_urls"],
  variant_image_url: ["variant_image_url", "variant_afbeelding"],
  image_alt: ["image_alt", "afbeelding_alt"],
  image_rights: ["image_rights", "beeldrechten", "afbeeldingsrechten"],
  safety_info: ["safety_info", "veiligheidsinformatie", "veiligheid", "waarschuwingen"],
  eu_responsible_person: ["eu_responsible_person", "eu_verantwoordelijke", "verantwoordelijke_eu"],
  country_of_origin: ["country_of_origin", "land_van_herkomst", "herkomstland"],
};

const HEADER_TO_FIELD = new Map<string, Field>(
  (Object.entries(ALIASES) as [Field, string[]][]).flatMap(([field, names]) => names.map((n) => [n, field] as const)),
);

export function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-.]+/g, "_");
}

type Row = Record<string, string>;

interface ParsedRow {
  rowNumber: number;
  original: Row;
  get: (field: Field) => string | undefined;
}

export interface CsvParseOptions {
  supplierKey: string;
  defaultCurrency?: string;
  maxRows?: number;
}

const MAX_VARIANTS = 2048;
const MAX_OPTIONS = 3;

export function parseProductCsv(text: string, options: CsvParseOptions): ParseResult {
  const errors: RowError[] = [];
  const maxRows = options.maxRows ?? 5000;
  const defaultCurrency = (options.defaultCurrency ?? "EUR").toUpperCase();

  const parsed = Papa.parse<Row>(text.replace(/^\uFEFF/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: normalizeHeader,
  });

  const headers = parsed.meta.fields ?? [];
  const known = new Set(headers.map((h) => HEADER_TO_FIELD.get(h)).filter(Boolean));
  if (!known.has("external_id") || !known.has("title")) {
    return {
      products: [],
      totalRows: 0,
      errors: [{ row: 1, message: "Verplichte kolommen ontbreken: external_id en title (of externe_id en titel)." }],
    };
  }

  for (const e of parsed.errors) {
    // Papa meldt o.a. regels met afwijkend aantal kolommen
    if (e.type === "Delimiter") continue;
    errors.push({ row: (e.row ?? 0) + 2, message: `CSV-opmaak: ${translatePapaError(e.code)}` });
  }

  if (parsed.data.length > maxRows) {
    return {
      products: [],
      totalRows: parsed.data.length,
      errors: [{ row: 1, message: `Bestand bevat ${parsed.data.length} regels; maximaal ${maxRows} toegestaan.` }],
    };
  }

  // Regels groeperen per external_id, volgorde behouden.
  const groups = new Map<string, ParsedRow[]>();
  parsed.data.forEach((original, index) => {
    const rowNumber = index + 2; // regel 1 = kopregel
    const fieldMap = new Map<Field, string>();
    for (const [header, value] of Object.entries(original)) {
      const field = HEADER_TO_FIELD.get(header);
      if (field && typeof value === "string" && !fieldMap.has(field)) fieldMap.set(field, value);
    }
    const row: ParsedRow = { rowNumber, original, get: (f) => fieldMap.get(f)?.trim() || undefined };
    const externalId = row.get("external_id");
    if (!externalId) {
      errors.push({ row: rowNumber, message: "external_id ontbreekt — regel overgeslagen." });
      return;
    }
    const list = groups.get(externalId) ?? [];
    list.push(row);
    groups.set(externalId, list);
  });

  const products: NormalizedProduct[] = [];
  for (const [externalId, rows] of groups) {
    const result = buildProduct(externalId, rows, options.supplierKey, defaultCurrency);
    if ("errors" in result) errors.push(...result.errors);
    else products.push(result.product);
  }

  errors.sort((a, b) => a.row - b.row);
  return { products, errors, totalRows: parsed.data.length };
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

function firstValue(rows: ParsedRow[], field: Field): string | undefined {
  for (const r of rows) {
    const v = r.get(field);
    if (v) return v;
  }
  return undefined;
}

function parseStock(row: ParsedRow): { quantity: number | null; status: StockStatus } {
  const quantity = parseInteger(row.get("stock_quantity"), "voorraad");
  if (quantity !== null) return { quantity, status: quantity > 0 ? "IN_STOCK" : "OUT_OF_STOCK" };
  const raw = row.get("stock_status")?.toLowerCase().replace(/[\s-]+/g, "_");
  if (!raw) return { quantity: null, status: "UNKNOWN" };
  if (["in_stock", "op_voorraad", "beschikbaar", "leverbaar", "ja", "yes"].includes(raw)) {
    return { quantity: null, status: "IN_STOCK" };
  }
  if (["out_of_stock", "uitverkocht", "niet_leverbaar", "niet_op_voorraad", "nee", "no"].includes(raw)) {
    return { quantity: null, status: "OUT_OF_STOCK" };
  }
  return { quantity: null, status: "UNKNOWN" };
}

function buildProduct(
  externalId: string,
  rows: ParsedRow[],
  supplierKey: string,
  defaultCurrency: string,
): { product: NormalizedProduct } | { errors: RowError[] } {
  const errors: RowError[] = [];
  const first = rows[0]!;
  const fail = (row: number, message: string) => {
    const full = `[${externalId}] ${message}`;
    // Dezelfde fout op dezelfde regel maar één keer melden (bv. product- én variantniveau).
    if (!errors.some((e) => e.row === row && e.message === full)) errors.push({ row, message: full });
  };

  const guard = <T>(row: ParsedRow, fn: () => T): T | null => {
    try {
      return fn();
    } catch (e) {
      if (e instanceof ValueError) {
        fail(row.rowNumber, e.message);
        return null;
      }
      throw e;
    }
  };

  // --- Productniveau -------------------------------------------------------
  const title = cleanText(firstValue(rows, "title"));
  if (!title) fail(first.rowNumber, "titel ontbreekt");
  else if (title.length > 255) fail(first.rowNumber, "titel is langer dan 255 tekens");

  if (externalId.length > 200) fail(first.rowNumber, "external_id is langer dan 200 tekens");

  const currencyCode = (firstValue(rows, "currency") ?? defaultCurrency).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currencyCode)) fail(first.rowNumber, `valuta "${currencyCode}" is ongeldig (gebruik bv. EUR, USD)`);

  const countryRaw = firstValue(rows, "country_of_origin")?.toUpperCase() ?? null;
  if (countryRaw && !/^[A-Z]{2}$/.test(countryRaw)) {
    fail(first.rowNumber, `land van herkomst "${countryRaw}" moet een landcode van 2 letters zijn (bv. NL, CN)`);
  }

  const sourceUrl = guard(first, () => parsePublicHttpsUrl(firstValue(rows, "source_url"), "bron-URL"));
  const shippingCost = guard(first, () => parseDecimal(firstValue(rows, "shipping_cost"), "verzendkosten"));
  const productCost = guard(first, () => parseDecimal(firstValue(rows, "cost_price"), "inkoopprijs"));
  const deliveryDaysMin = guard(first, () => parseInteger(firstValue(rows, "delivery_days_min"), "levertijd min"));
  const deliveryDaysMax = guard(first, () => parseInteger(firstValue(rows, "delivery_days_max"), "levertijd max"));
  if (deliveryDaysMin !== null && deliveryDaysMax !== null && deliveryDaysMin > deliveryDaysMax) {
    fail(first.rowNumber, "levertijd min is groter dan levertijd max");
  }

  const imageRights = parseBoolean(firstValue(rows, "image_rights")) === true ? "CONFIRMED_BY_SUPPLIER" : "UNVERIFIED";
  const imageAlt = cleanText(firstValue(rows, "image_alt"), 512);

  // --- Opties --------------------------------------------------------------
  const optionNames: string[] = [];
  for (const i of [1, 2, 3] as const) {
    const name = cleanText(firstValue(rows, `option${i}_name` as Field), 255);
    if (name) optionNames.push(name);
  }

  // --- Varianten -------------------------------------------------------------
  const variants: NormalizedVariant[] = [];
  const images: NormalizedImage[] = [];
  const seenImages = new Set<string>();
  const addImage = (url: string) => {
    if (seenImages.has(url)) return;
    seenImages.add(url);
    images.push({ url, alt: imageAlt ?? title, rights: imageRights });
  };

  const seenCombos = new Set<string>();
  const seenVariantIds = new Set<string>();

  for (const row of rows) {
    for (const url of splitList(row.get("image_urls"))) {
      const clean = guard(row, () => parsePublicHttpsUrl(url, "afbeelding"));
      if (clean) addImage(clean);
    }

    const values: { name: string; value: string }[] = [];
    for (const [idx, name] of optionNames.entries()) {
      const value = cleanText(row.get(`option${idx + 1}_value` as Field), 255);
      if (value) values.push({ name, value });
    }
    if (rows.length > 1 && optionNames.length === 0) {
      fail(row.rowNumber, "meerdere regels voor hetzelfde product, maar geen opties (option1_name/option1_value)");
      continue;
    }
    if (values.length !== optionNames.length) {
      fail(row.rowNumber, `elke variant moet een waarde hebben voor alle opties (${optionNames.join(", ")})`);
      continue;
    }
    const combo = values.map((v) => v.value.toLowerCase()).join(" / ");
    if (seenCombos.has(combo)) {
      fail(row.rowNumber, `dubbele variant "${combo}"`);
      continue;
    }
    seenCombos.add(combo);

    const sku = cleanText(row.get("sku"), 255);
    const variantExternalId =
      cleanText(row.get("variant_id"), 200) ?? sku ?? (values.length ? values.map((v) => v.value).join("/") : externalId);
    if (seenVariantIds.has(variantExternalId)) {
      fail(row.rowNumber, `variant-ID "${variantExternalId}" komt meerdere keren voor`);
      continue;
    }
    seenVariantIds.add(variantExternalId);

    const variantCost = guard(row, () => parseDecimal(row.get("variant_cost_price") ?? row.get("cost_price"), "inkoopprijs"));
    const stock = guard(row, () => parseStock(row)) ?? { quantity: null, status: "UNKNOWN" as const };
    const weightGrams = guard(row, () => parseInteger(row.get("weight_grams"), "gewicht"));
    const variantImage = guard(row, () => parsePublicHttpsUrl(row.get("variant_image_url"), "variantafbeelding"));
    if (variantImage) addImage(variantImage);

    variants.push({
      externalId: variantExternalId,
      sku,
      barcode: cleanText(row.get("barcode"), 255),
      options: values,
      costPrice: variantCost ?? productCost,
      stockQuantity: stock.quantity,
      stockStatus: stock.status,
      weightGrams,
      imageUrl: variantImage,
    });
  }

  if (optionNames.length > MAX_OPTIONS) fail(first.rowNumber, `maximaal ${MAX_OPTIONS} opties toegestaan`);
  if (variants.length > MAX_VARIANTS) fail(first.rowNumber, `maximaal ${MAX_VARIANTS} varianten per product`);
  if (variants.length === 0 && errors.length === 0) fail(first.rowNumber, "geen geldige varianten");

  if (errors.length > 0) return { errors };

  const stockStatus: StockStatus = variants.some((v) => v.stockStatus === "IN_STOCK")
    ? "IN_STOCK"
    : variants.every((v) => v.stockStatus === "OUT_OF_STOCK")
      ? "OUT_OF_STOCK"
      : "UNKNOWN";

  const product: NormalizedProduct = {
    supplierKey,
    externalId,
    title: title!,
    descriptionHtml: sanitizeDescription(firstValue(rows, "description")),
    vendor: cleanText(firstValue(rows, "vendor"), 255),
    brand: cleanText(firstValue(rows, "brand"), 255),
    productType: cleanText(firstValue(rows, "product_type"), 255),
    tags: splitTags(firstValue(rows, "tags")),
    sourceUrl,
    gtin: cleanText(firstValue(rows, "gtin"), 64),
    currencyCode,
    shippingCost,
    deliveryDaysMin,
    deliveryDaysMax,
    stockStatus,
    safetyInfo: cleanText(firstValue(rows, "safety_info"), 5000),
    euResponsiblePerson: cleanText(firstValue(rows, "eu_responsible_person"), 1000),
    countryOfOrigin: countryRaw,
    options: optionNames.map((name) => ({
      name,
      values: [...new Set(variants.map((v) => v.options.find((o) => o.name === name)!.value))],
    })),
    variants,
    images,
    raw: rows.map((r) => r.original),
  };

  const check = normalizedProductSchema.safeParse(product);
  if (!check.success) {
    return {
      errors: check.error.issues.map((issue) => ({
        row: first.rowNumber,
        message: `[${externalId}] ongeldige waarde in ${issue.path.join(".")}: ${issue.message}`,
      })),
    };
  }
  return { product: check.data };
}
