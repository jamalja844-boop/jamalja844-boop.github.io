import { sourceKeyFor, type NormalizedProduct } from "./types";

export type DuplicateReason = "ALREADY_IMPORTED" | "SAME_SOURCE_URL" | "DUPLICATE_IN_FILE";

export interface DuplicateInfo {
  reason: DuplicateReason;
  message: string;
  /** Bron-sleutel of URL van het bestaande product */
  reference: string;
}

export interface ExistingCatalog {
  /** Bron-sleutels van producten die al naar Shopify zijn geïmporteerd */
  importedSourceKeys: Set<string>;
  /** Bron-URL's van producten die al naar Shopify zijn geïmporteerd */
  importedSourceUrls: Set<string>;
}

export function normalizeUrl(url: string): string {
  const u = new URL(url);
  u.hash = "";
  // Trackingparameters negeren; overige parameters (bv. productvariant) behouden.
  for (const key of [...u.searchParams.keys()]) {
    if (/^(utm_|spm|gclid|fbclid|scm|pdp_|_t$)/i.test(key)) u.searchParams.delete(key);
  }
  return `${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, "")}${u.search}`;
}

/**
 * Detecteert dubbele producten:
 * 1. dezelfde leverancier + externe ID is al geïmporteerd;
 * 2. dezelfde bron-URL is al geïmporteerd (ook via een andere leverancier/bestand);
 * 3. dezelfde bron-URL komt meerdere keren voor in hetzelfde bestand.
 */
export function detectDuplicates(
  products: NormalizedProduct[],
  existing: ExistingCatalog,
): Map<string, DuplicateInfo> {
  const result = new Map<string, DuplicateInfo>();
  const existingUrls = new Set([...existing.importedSourceUrls].map(normalizeUrl));
  const urlsInFile = new Map<string, string>();

  for (const product of products) {
    const key = sourceKeyFor(product.supplierKey, product.externalId);
    if (existing.importedSourceKeys.has(key)) {
      result.set(key, { reason: "ALREADY_IMPORTED", message: "Dit product is al eerder geïmporteerd.", reference: key });
      continue;
    }
    if (!product.sourceUrl) continue;
    const url = normalizeUrl(product.sourceUrl);
    if (existingUrls.has(url)) {
      result.set(key, {
        reason: "SAME_SOURCE_URL",
        message: "Een product met dezelfde bron-URL is al geïmporteerd.",
        reference: product.sourceUrl,
      });
      continue;
    }
    const firstKey = urlsInFile.get(url);
    if (firstKey) {
      result.set(key, {
        reason: "DUPLICATE_IN_FILE",
        message: `Zelfde bron-URL als ${firstKey.split(":").slice(1).join(":")} in dit bestand.`,
        reference: firstKey,
      });
      continue;
    }
    urlsInFile.set(url, key);
  }
  return result;
}
