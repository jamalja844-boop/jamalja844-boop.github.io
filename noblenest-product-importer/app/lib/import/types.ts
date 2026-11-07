import { z } from "zod";

/** Genormaliseerd productformaat — elke importbron (CSV, feed, leverancier-API) levert dit op. */

export const stockStatusSchema = z.enum(["IN_STOCK", "OUT_OF_STOCK", "UNKNOWN"]);
export type StockStatus = z.infer<typeof stockStatusSchema>;

export const imageRightsSchema = z.enum(["UNVERIFIED", "CONFIRMED_BY_SUPPLIER", "CONFIRMED_BY_MERCHANT", "REJECTED"]);
export type ImageRights = z.infer<typeof imageRightsSchema>;

export const optionValueSchema = z.object({ name: z.string().min(1), value: z.string().min(1) });

export const normalizedVariantSchema = z.object({
  externalId: z.string().min(1),
  sku: z.string().nullable(),
  barcode: z.string().nullable(),
  options: z.array(optionValueSchema),
  costPrice: z.string().nullable(),
  stockQuantity: z.number().int().nullable(),
  stockStatus: stockStatusSchema,
  weightGrams: z.number().int().nonnegative().nullable(),
  imageUrl: z.string().url().nullable(),
});
export type NormalizedVariant = z.infer<typeof normalizedVariantSchema>;

export const normalizedImageSchema = z.object({
  url: z.string().url(),
  alt: z.string().nullable(),
  rights: imageRightsSchema,
});
export type NormalizedImage = z.infer<typeof normalizedImageSchema>;

export const normalizedProductSchema = z.object({
  supplierKey: z.string().min(1),
  externalId: z.string().min(1).max(200),
  title: z.string().min(1),
  descriptionHtml: z.string().nullable(),
  vendor: z.string().nullable(),
  brand: z.string().nullable(),
  productType: z.string().nullable(),
  tags: z.array(z.string()),
  sourceUrl: z.string().url().nullable(),
  gtin: z.string().nullable(),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  shippingCost: z.string().nullable(),
  deliveryDaysMin: z.number().int().nonnegative().nullable(),
  deliveryDaysMax: z.number().int().nonnegative().nullable(),
  stockStatus: stockStatusSchema,
  safetyInfo: z.string().nullable(),
  euResponsiblePerson: z.string().nullable(),
  countryOfOrigin: z.string().regex(/^[A-Z]{2}$/).nullable(),
  /** Optienamen in volgorde, met hun waarden */
  options: z.array(z.object({ name: z.string(), values: z.array(z.string()) })),
  variants: z.array(normalizedVariantSchema).min(1),
  images: z.array(normalizedImageSchema),
  /** Oorspronkelijke bronregels, ongewijzigd */
  raw: z.array(z.record(z.string(), z.string())),
});
export type NormalizedProduct = z.infer<typeof normalizedProductSchema>;

export interface RowError {
  row: number;
  message: string;
}

export interface ParseResult {
  products: NormalizedProduct[];
  errors: RowError[];
  totalRows: number;
}

/** Unieke bron-sleutel die ook als Shopify-metafield ($app.source_id) wordt opgeslagen. */
export function sourceKeyFor(supplierKey: string, externalId: string): string {
  return `${supplierKey.trim().toLowerCase()}:${externalId.trim()}`;
}
