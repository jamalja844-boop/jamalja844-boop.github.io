/**
 * Handmatige invoer → genormaliseerd product (via dezelfde validatie als alle andere bronnen).
 */
import { randomBytes } from "node:crypto";
import { parseJsonFeed } from "./feeds/json-feed";
import type { ParseResult } from "./types";

export interface ManualProductForm {
  title: string;
  description?: string;
  vendor?: string;
  brand?: string;
  productType?: string;
  tags?: string;
  sku?: string;
  gtin?: string;
  currency?: string;
  costPrice: string;
  shippingCost?: string;
  deliveryDaysMin?: string;
  deliveryDaysMax?: string;
  stockQuantity?: string;
  weightGrams?: string;
  imageUrls?: string;
  imageRightsConfirmed: boolean;
  safetyInfo?: string;
  euResponsiblePerson?: string;
  countryOfOrigin?: string;
  sourceUrl?: string;
  optionName?: string;
  optionValues?: string;
}

const blank = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

/** Stabiele ID bij een SKU (zodat dubbel invoeren wordt herkend), anders uniek. */
export function manualExternalId(sku: string | undefined): string {
  const s = blank(sku);
  if (s) return `handmatig-${s.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || randomBytes(4).toString("hex")}`;
  return `handmatig-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
}

export function parseManualProduct(form: ManualProductForm, defaultCurrency: string): ParseResult {
  const values = (form.optionValues ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const optionName = blank(form.optionName);
  const product: Record<string, unknown> = {
    external_id: manualExternalId(form.sku),
    title: form.title,
    description: blank(form.description),
    vendor: blank(form.vendor),
    brand: blank(form.brand),
    product_type: blank(form.productType),
    tags: blank(form.tags),
    gtin: blank(form.gtin),
    currency: blank(form.currency) ?? defaultCurrency,
    cost_price: form.costPrice,
    shipping_cost: blank(form.shippingCost),
    delivery_days_min: blank(form.deliveryDaysMin),
    delivery_days_max: blank(form.deliveryDaysMax),
    image_urls: blank(form.imageUrls)?.split(/\s+/).join("|"),
    safety_info: blank(form.safetyInfo),
    eu_responsible_person: blank(form.euResponsiblePerson),
    country_of_origin: blank(form.countryOfOrigin)?.toUpperCase(),
    source_url: blank(form.sourceUrl),
  };
  if (optionName && values.length > 0) {
    product.options = [optionName];
    product.variants = values.map((value) => ({
      sku: blank(form.sku) ? `${blank(form.sku)}-${value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : undefined,
      option_values: [value],
      stock_quantity: blank(form.stockQuantity),
      weight_grams: blank(form.weightGrams),
    }));
  } else {
    product.sku = blank(form.sku);
    product.stock_quantity = blank(form.stockQuantity);
    product.weight_grams = blank(form.weightGrams);
  }
  const clean = Object.fromEntries(Object.entries(product).filter(([, v]) => v !== undefined));
  const result = parseJsonFeed(JSON.stringify([clean]), { supplierKey: "manual", defaultCurrency });
  if (form.imageRightsConfirmed) {
    for (const p of result.products) for (const img of p.images) img.rights = "CONFIRMED_BY_MERCHANT";
  }
  return result;
}
