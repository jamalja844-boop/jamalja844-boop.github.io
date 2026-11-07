/**
 * Gedeelde normalisatie voor alle importbronnen (CSV, XML-feed, JSON-feed).
 *
 * Elke bron levert "records" aan (één record per variant, met canonieke veldnamen).
 * Records met dezelfde external_id vormen samen één product. Zo krijgen alle formaten
 * exact dezelfde validatie, foutmeldingen en controles.
 */
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

export type Field =
  | "external_id" | "title" | "description" | "vendor" | "brand" | "product_type" | "tags"
  | "source_url" | "gtin" | "currency" | "cost_price" | "variant_cost_price" | "shipping_cost"
  | "delivery_days_min" | "delivery_days_max" | "stock_quantity" | "stock_status" | "variant_id"
  | "sku" | "barcode" | "option1_name" | "option1_value" | "option2_name" | "option2_value"
  | "option3_name" | "option3_value" | "weight_grams" | "image_urls" | "variant_image_url"
  | "image_alt" | "image_rights" | "safety_info" | "eu_responsible_person" | "country_of_origin";

export const FIELD_ALIASES: Record<Field, string[]> = {
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

export const NAME_TO_FIELD = new Map<string, Field>(
  (Object.entries(FIELD_ALIASES) as [Field, string[]][]).flatMap(([field, names]) => names.map((n) => [n, field] as const)),
);

/** Normaliseert een kolom-/sleutelnaam: zonder BOM en accenten, kleine letters, underscores. */
export function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-.]+/g, "_");
}

export interface SourceRecord {
  /** Regel- of itemnummer in de bron (voor foutmeldingen) */
  rowNumber: number;
  /** Oorspronkelijke bronwaarden, ongewijzigd bewaard */
  original: Record<string, string>;
  get: (field: Field) => string | undefined;
}

export function makeRecord(rowNumber: number, values: Partial<Record<Field, string | undefined>>, original: Record<string, string>): SourceRecord {
  return { rowNumber, original, get: (f) => values[f]?.trim() || undefined };
}

/** Maakt een record van een object met (Nederlandse of Engelse) veldnamen. */
export function recordFromNamedValues(rowNumber: number, named: Record<string, string>): SourceRecord {
  const values: Partial<Record<Field, string>> = {};
  for (const [name, value] of Object.entries(named)) {
    const field = NAME_TO_FIELD.get(normalizeHeader(name));
    if (field && typeof value === "string" && values[field] === undefined) values[field] = value;
  }
  return makeRecord(rowNumber, values, named);
}

export interface NormalizeOptions {
  supplierKey: string;
  defaultCurrency?: string;
  /** Optioneel bronlabel; wordt vóór de externe ID gezet om botsingen tussen bronnen te voorkomen. */
  idPrefix?: string | null;
  /** Leverancier heeft gebruik van de afbeeldingen toegestaan (geldt voor de hele bron). */
  imageRightsFromSupplier?: boolean;
}

const MAX_VARIANTS = 2048;
const MAX_OPTIONS = 3;

export const SOURCE_LABEL_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

export function normalizeRecords(records: SourceRecord[], options: NormalizeOptions): { products: NormalizedProduct[]; errors: RowError[] } {
  const errors: RowError[] = [];
  const defaultCurrency = (options.defaultCurrency ?? "EUR").toUpperCase();
  const prefix = options.idPrefix?.trim() || null;
  if (prefix && !SOURCE_LABEL_PATTERN.test(prefix)) {
    return { products: [], errors: [{ row: 1, message: "Bronlabel mag alleen kleine letters, cijfers en streepjes bevatten (max. 40)." }] };
  }

  const groups = new Map<string, SourceRecord[]>();
  for (const record of records) {
    const rawId = record.get("external_id");
    if (!rawId) {
      errors.push({ row: record.rowNumber, message: "external_id ontbreekt — regel overgeslagen." });
      continue;
    }
    const externalId = prefix ? `${prefix}:${rawId}` : rawId;
    const list = groups.get(externalId) ?? [];
    list.push(record);
    groups.set(externalId, list);
  }

  const products: NormalizedProduct[] = [];
  for (const [externalId, rows] of groups) {
    const result = buildProduct(externalId, rows, options.supplierKey, defaultCurrency, options.imageRightsFromSupplier === true);
    if ("errors" in result) errors.push(...result.errors);
    else products.push(result.product);
  }
  errors.sort((a, b) => a.row - b.row);
  return { products, errors };
}

/** Hulpfunctie voor bronnen die zelf al records hebben opgebouwd. */
export function toParseResult(records: SourceRecord[], options: NormalizeOptions, extraErrors: RowError[] = [], maxRows = 5000): ParseResult {
  if (records.length > maxRows) {
    return { products: [], totalRows: records.length, errors: [{ row: 1, message: `Bron bevat ${records.length} regels/varianten; maximaal ${maxRows} toegestaan.` }] };
  }
  const { products, errors } = normalizeRecords(records, options);
  return { products, totalRows: records.length, errors: [...extraErrors, ...errors].sort((a, b) => a.row - b.row) };
}

function firstValue(rows: SourceRecord[], field: Field): string | undefined {
  for (const r of rows) {
    const v = r.get(field);
    if (v) return v;
  }
  return undefined;
}

function parseStock(row: SourceRecord): { quantity: number | null; status: StockStatus } {
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
  rows: SourceRecord[],
  supplierKey: string,
  defaultCurrency: string,
  imageRightsFromSupplier: boolean,
): { product: NormalizedProduct } | { errors: RowError[] } {
  const errors: RowError[] = [];
  const first = rows[0]!;
  const fail = (row: number, message: string) => {
    const full = `[${externalId}] ${message}`;
    // Dezelfde fout op dezelfde regel maar één keer melden (bv. product- én variantniveau).
    if (!errors.some((e) => e.row === row && e.message === full)) errors.push({ row, message: full });
  };

  const guard = <T>(row: SourceRecord, fn: () => T): T | null => {
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

  const rightsConfirmed = imageRightsFromSupplier || parseBoolean(firstValue(rows, "image_rights")) === true;
  const imageRights = rightsConfirmed ? "CONFIRMED_BY_SUPPLIER" : "UNVERIFIED";
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
