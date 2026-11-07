/**
 * XML-productfeed in Google Merchant Center-formaat (RSS 2.0 of Atom met de g:-namespace).
 * Dit is het meest gebruikte feedformaat bij leveranciers en dropshippers.
 *
 * - Varianten: items met dezelfde g:item_group_id vormen één product. Opties worden afgeleid
 *   uit de attributen die binnen de groep verschillen (kleur, maat, materiaal, patroon).
 * - Inkoopprijs: g:cost_of_goods_sold als die er is, anders g:price (de prijs die de leverancier
 *   jou rekent). Dit wordt als controlepunt gemeld.
 * - Veiligheid: DOCTYPE/ENTITY-declaraties worden geweigerd (XXE / "billion laughs").
 */
import { XMLParser } from "fast-xml-parser";
import type { ParseResult, RowError } from "../types";
import { makeRecord, toParseResult, type Field, type NormalizeOptions, type SourceRecord } from "../normalize";

const GOOGLE_NS = "http://base.google.com/ns/1.0";

export interface FeedParseOptions extends NormalizeOptions {
  maxRows?: number;
}

type XmlValue = string | number | boolean | { "#text"?: string | number; "@_href"?: string; [k: string]: unknown } | XmlValue[];
type XmlItem = Record<string, XmlValue>;

const OPTION_ATTRIBUTES: { key: string; name: string }[] = [
  { key: "color", name: "Kleur" },
  { key: "size", name: "Maat" },
  { key: "material", name: "Materiaal" },
  { key: "pattern", name: "Patroon" },
];

export function parseGoogleXmlFeed(xml: string, options: FeedParseOptions): ParseResult {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    return fail("XML met DOCTYPE- of ENTITY-declaraties wordt om veiligheidsredenen niet geaccepteerd.");
  }
  const prefix = xml.match(new RegExp(`xmlns:([A-Za-z0-9_-]+)\\s*=\\s*["']${GOOGLE_NS.replace(/[./]/g, "\\$&")}/?["']`))?.[1] ?? "g";

  let doc: Record<string, unknown>;
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      parseTagValue: false,
      trimValues: true,
      processEntities: true,
      isArray: (name) => ["item", "entry", `${prefix}:additional_image_link`, `${prefix}:shipping`, "link"].includes(name),
    });
    doc = parser.parse(xml, true) as Record<string, unknown>;
  } catch (error) {
    return fail(`Ongeldige XML: ${error instanceof Error ? error.message : String(error)}`);
  }

  const rss = doc.rss as { channel?: { item?: XmlItem[] } } | undefined;
  const atom = doc.feed as { entry?: XmlItem[] } | undefined;
  const items = rss?.channel?.item ?? atom?.entry ?? null;
  if (!items) return fail("Geen productfeed herkend: verwacht RSS (<rss><channel><item>) of Atom (<feed><entry>).");

  const g = (item: XmlItem, key: string) => text(item[`${prefix}:${key}`]);

  // Items groeperen op item_group_id (varianten) of id.
  const groups = new Map<string, { item: XmlItem; index: number }[]>();
  items.forEach((item, index) => {
    const groupId = g(item, "item_group_id") ?? g(item, "id") ?? text(item.id);
    const key = groupId ?? `__zonder_id_${index}`;
    const list = groups.get(key) ?? [];
    list.push({ item, index });
    groups.set(key, list);
  });

  const records: SourceRecord[] = [];
  const errors: RowError[] = [];

  for (const [groupKey, members] of groups) {
    const hasGroup = members.length > 1 || !!g(members[0]!.item, "item_group_id");
    // Opties: attributen die binnen de groep voorkomen en verschillen.
    const optionAttrs = hasGroup
      ? OPTION_ATTRIBUTES.filter(({ key }) => {
          const values = members.map((m) => g(m.item, key));
          return values.every(Boolean) && new Set(values.map((v) => v!.toLowerCase())).size > 1;
        }).slice(0, 3)
      : [];
    const useFallbackOption = members.length > 1 && optionAttrs.length === 0;

    members.forEach(({ item, index }, memberIdx) => {
      const itemNo = index + 1;
      const price = parsePrice(g(item, "cost_of_goods_sold") ?? g(item, "price"));
      if (g(item, "price") && !price) errors.push({ row: itemNo, message: `[${groupKey}] prijs "${g(item, "price")}" niet herkend` });
      const shipping = firstShipping(item, prefix);
      const handlingMin = toInt(g(item, "min_handling_time"));
      const handlingMax = toInt(g(item, "max_handling_time"));
      const productType = g(item, "product_type")?.split(">").pop()?.trim();
      const additional = arr(item[`${prefix}:additional_image_link`]).map(text).filter(Boolean) as string[];
      const imageLink = g(item, "image_link");

      const values: Partial<Record<Field, string | undefined>> = {
        external_id: groupKey.startsWith("__zonder_id_") ? undefined : groupKey,
        variant_id: g(item, "id") ?? text(item.id),
        title: memberIdx === 0 ? g(item, "title") ?? text(item.title) : undefined,
        description: memberIdx === 0 ? g(item, "description") ?? text(item.description) ?? text(item.summary) : undefined,
        source_url: memberIdx === 0 ? g(item, "link") ?? linkOf(item) : undefined,
        brand: g(item, "brand"),
        product_type: productType,
        gtin: memberIdx === 0 && !hasGroup ? g(item, "gtin") : undefined,
        barcode: g(item, "gtin"),
        sku: g(item, "mpn") ?? g(item, "id") ?? text(item.id),
        currency: price?.currency,
        cost_price: price?.amount,
        shipping_cost: shipping.amount,
        delivery_days_min: sumDays(handlingMin, shipping.minTransit),
        delivery_days_max: sumDays(handlingMax, shipping.maxTransit),
        stock_status: mapAvailability(g(item, "availability")),
        weight_grams: parseWeight(g(item, "shipping_weight") ?? g(item, "product_weight")),
        image_urls: [imageLink, ...additional].filter(Boolean).join("|"),
        variant_image_url: hasGroup ? imageLink : undefined,
      };
      optionAttrs.forEach(({ key, name }, i) => {
        values[`option${i + 1}_name` as Field] = name;
        values[`option${i + 1}_value` as Field] = g(item, key);
      });
      if (useFallbackOption) {
        values.option1_name = "Variant";
        values.option1_value = g(item, "title") ?? g(item, "id") ?? `Variant ${memberIdx + 1}`;
      }
      records.push(makeRecord(itemNo, values, flatten(item)));
    });
  }

  return toParseResult(records, options, errors, options.maxRows ?? 5000);
}

function fail(message: string): ParseResult {
  return { products: [], totalRows: 0, errors: [{ row: 1, message }] };
}

function arr(value: XmlValue | undefined): XmlValue[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value: XmlValue | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return text(value[0]);
  if (typeof value === "object") {
    const t = value["#text"];
    return t === undefined ? undefined : String(t).trim() || undefined;
  }
  const s = String(value).trim();
  return s || undefined;
}

function linkOf(item: XmlItem): string | undefined {
  for (const l of arr(item.link)) {
    if (typeof l === "object" && !Array.isArray(l) && l["@_href"]) return String(l["@_href"]);
    const t = text(l);
    if (t) return t;
  }
  return undefined;
}

/** "12.99 EUR" of "EUR 12,99" → { amount: "12.99", currency: "EUR" } */
export function parsePrice(value: string | undefined): { amount: string; currency: string } | null {
  if (!value) return null;
  const m = value.trim().match(/^(?:([A-Z]{3})\s*)?([0-9]+(?:[.,][0-9]+)*)\s*([A-Z]{3})?$/);
  if (!m) return null;
  const currency = m[1] ?? m[3];
  if (!currency) return null;
  return { amount: m[2]!, currency };
}

function firstShipping(item: XmlItem, prefix: string): { amount?: string; minTransit?: number; maxTransit?: number } {
  const entries = arr(item[`${prefix}:shipping`]).filter((e): e is Record<string, XmlValue> => typeof e === "object" && !Array.isArray(e));
  const nl = entries.find((e) => text(e[`${prefix}:country`])?.toUpperCase() === "NL") ?? entries[0];
  if (!nl) return {};
  return {
    amount: parsePrice(text(nl[`${prefix}:price`]))?.amount,
    minTransit: toInt(text(nl[`${prefix}:min_transit_time`])),
    maxTransit: toInt(text(nl[`${prefix}:max_transit_time`])),
  };
}

function toInt(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value.trim())) return undefined;
  return Number(value.trim());
}

function sumDays(a: number | undefined, b: number | undefined): string | undefined {
  if (a === undefined && b === undefined) return undefined;
  return String((a ?? 0) + (b ?? 0));
}

function mapAvailability(value: string | undefined): string | undefined {
  switch (value?.toLowerCase().replace(/\s+/g, "_")) {
    case "in_stock":
      return "in_stock";
    case "out_of_stock":
      return "out_of_stock";
    default:
      return undefined; // preorder/backorder/onbekend → Voorraad onbekend
  }
}

/** "1.2 kg", "350 g", "2 lb", "8 oz" → gram (geheel getal) */
export function parseWeight(value: string | undefined): string | undefined {
  const m = value?.trim().match(/^([0-9]+(?:[.,][0-9]+)?)\s*(kg|g|lb|oz)$/i);
  if (!m) return undefined;
  const n = Number(m[1]!.replace(",", "."));
  const factor = { kg: 1000, g: 1, lb: 453.59237, oz: 28.349523125 }[m[2]!.toLowerCase() as "kg" | "g" | "lb" | "oz"];
  return String(Math.round(n * factor));
}

/** Oorspronkelijke itemvelden als platte tekst bewaren (voor rawData). */
function flatten(item: XmlItem): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(item)) {
    if (k.startsWith("@_")) continue;
    const values = arr(v).map((x) => (typeof x === "object" && !Array.isArray(x) ? JSON.stringify(x) : text(x))).filter(Boolean);
    if (values.length) out[k] = values.join(" | ").slice(0, 5000);
  }
  return out;
}
