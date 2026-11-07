/**
 * Aanpassingen van de winkelier op een product in het importvoorbeeld.
 * De oorspronkelijke leveranciersgegevens blijven altijd ongewijzigd bewaard.
 */
import { z } from "zod";
import { sanitizeDescription } from "./html";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Maximaal ${max} tekens`)
    .optional()
    .transform((s) => (s ? s : undefined));

export const itemOverridesSchema = z
  .object({
    title: optionalText(255),
    descriptionHtml: z
      .string()
      .max(65000)
      .optional()
      .transform((s) => (s === undefined ? undefined : sanitizeDescription(s) ?? undefined)),
    productType: optionalText(255),
    vendor: optionalText(255),
    tags: z.array(z.string().trim().min(1).max(255)).max(250).optional(),
    seoTitle: optionalText(70),
    seoDescription: optionalText(320),
    /** Geselecteerde afbeeldingen in volgorde; de eerste is de hoofdfoto. Niet vermeld = niet importeren. */
    images: z.array(z.string().url()).max(250).optional(),
    /** Afbeelding per variant (externe variant-ID → URL, of null voor geen) */
    variantImages: z.record(z.string(), z.string().url().nullable()).optional(),
    /** Shopify-collecties (handmatige collecties) */
    collections: z.array(z.string().regex(/^gid:\/\/shopify\/Collection\/\d+$/, "Ongeldige collectie")).max(250).optional(),
  })
  .strict();

export type ItemOverrides = z.infer<typeof itemOverridesSchema>;

/**
 * Sleutel om (bijna) dezelfde afbeelding te herkennen: zonder querystring, hoofdletters
 * en gangbare formaat-achtervoegsels (bv. _800x800, -1200x1200, @2x).
 */
export function imageDuplicateKey(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname
      .toLowerCase()
      .replace(/([_-])\d{2,5}x\d{0,5}(?=\.[a-z0-9]+$|$)/, "")
      .replace(/@\dx(?=\.[a-z0-9]+$|$)/, "");
    return `${u.hostname.toLowerCase()}${path}`;
  } catch {
    return url;
  }
}

/** Groepen van afbeeldingen die waarschijnlijk hetzelfde zijn (alleen groepen met ≥ 2). */
export function findDuplicateImages(urls: string[]): string[][] {
  const groups = new Map<string, string[]>();
  for (const url of urls) {
    const key = imageDuplicateKey(url);
    groups.set(key, [...(groups.get(key) ?? []), url]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

/** Minimale aanbevolen afmeting voor productfoto's (Shopify gebruikt zoom vanaf 800 px). */
export const RECOMMENDED_MIN_IMAGE_SIZE = 800;
