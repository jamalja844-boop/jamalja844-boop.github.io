/**
 * Bouwt de invoer voor de Shopify Admin GraphQL-mutatie `productSet` (API 2026-10).
 *
 * Veiligheidsregels:
 * - Status is ALTIJD "DRAFT": Noblenest publiceert nooit automatisch.
 * - De mutatie wordt alleen gebruikt om NIEUWE producten aan te maken (zonder identifier).
 *   productSet verwijdert lijst-elementen (varianten, media, metafields) die niet in de invoer staan;
 *   daarom wordt productSet nooit op een bestaand product uitgevoerd. Updates van bestaande
 *   producten lopen in een latere fase via gerichte mutaties (productVariantsBulkUpdate).
 * - Afbeeldingen worden alleen meegestuurd als de rechten bevestigd zijn.
 * - Alle afbeeldingen staan in `files` (volgorde = volgorde in Shopify, eerste = hoofdfoto).
 *   Een variantafbeelding verwijst naar dezelfde bron; Shopify maakt daar geen dubbele media van
 *   (zie het voorbeeld "Create a product and associate files" in de productSet-documentatie).
 *
 * Documentatie: https://shopify.dev/docs/api/admin-graphql/2026-10/mutations/productSet
 */
import type { NormalizedProduct } from "../import/types";

export const SOURCE_ID_NAMESPACE = "$app";
export const SOURCE_ID_KEY = "source_id";

export const PRODUCT_SET_CREATE_MUTATION = `#graphql
  mutation NoblenestProductCreate($input: ProductSetInput!) {
    productSet(input: $input, synchronous: true) {
      product {
        id
        handle
        status
        variants(first: 250) {
          nodes {
            id
            sku
            selectedOptions {
              name
              value
            }
          }
        }
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

export const PRODUCT_BY_SOURCE_ID_QUERY = `#graphql
  query NoblenestProductBySourceId($identifier: ProductIdentifierInput!) {
    productByIdentifier(identifier: $identifier) {
      id
      handle
      status
    }
  }
`;

export interface VariantPricing {
  /** Verkoopprijs in winkelvaluta, bv. "29.95" */
  price: string;
  /** Kostprijs per stuk in winkelvaluta (voor Shopify-winstrapportage), optioneel */
  unitCost: string | null;
}

export interface BuildOptions {
  sourceKey: string;
  /** Prijs per variant (sleutel: variant.externalId) */
  pricing: Map<string, VariantPricing>;
  /** true = afbeeldingen meesturen die (door leverancier of winkelier) zijn vrijgegeven */
  merchantConfirmedImageRights: boolean;
  defaultVendor?: string | null;
  extraTags?: string[];
  /** Aanpassingen van de winkelier of AI-teksten (alleen gebruikt als ze bestaan) */
  overrides?: ProductOverrides;
}

export interface ProductOverrides {
  title?: string | null;
  descriptionHtml?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  productType?: string | null;
  vendor?: string | null;
  tags?: string[] | null;
  /** Geselecteerde afbeeldingen in volgorde (eerste = hoofdfoto); undefined = alle toegestane */
  images?: string[] | null;
  /** Afbeelding per variant (externe variant-ID → URL of null) */
  variantImages?: Record<string, string | null> | null;
  /** Shopify-collectie-ID's (handmatige collecties) */
  collections?: string[] | null;
}

export interface ProductSetInput {
  title: string;
  descriptionHtml?: string;
  vendor?: string;
  productType?: string;
  status: "DRAFT";
  tags?: string[];
  seo?: { title?: string; description?: string };
  productOptions: { name: string; position: number; values: { name: string }[] }[];
  variants: {
    optionValues: { optionName: string; name: string }[];
    price: string;
    sku?: string;
    barcodes?: { value: string }[];
    inventoryPolicy: "DENY";
    taxable: boolean;
    inventoryItem?: {
      cost?: string;
      tracked?: boolean;
      requiresShipping?: boolean;
      countryCodeOfOrigin?: string;
      measurement?: { weight: { value: number; unit: "GRAMS" } };
    };
    file?: { originalSource: string; contentType: "IMAGE"; alt?: string };
  }[];
  files?: { originalSource: string; contentType: "IMAGE"; alt?: string }[];
  collections?: string[];
  metafields: { namespace: string; key: string; type: string; value: string }[];
}

export class ProductSetBuildError extends Error {}

export function imagesAllowed(product: NormalizedProduct, merchantConfirmed: boolean) {
  return product.images.filter(
    (img) =>
      img.rights === "CONFIRMED_BY_SUPPLIER" ||
      img.rights === "CONFIRMED_BY_MERCHANT" ||
      (merchantConfirmed && img.rights === "UNVERIFIED"),
  );
}

/** Definitieve afbeeldingen: toegestaan (beeldrechten) én geselecteerd, in de gekozen volgorde. */
export function finalImages(product: NormalizedProduct, merchantConfirmed: boolean, overrides?: ProductOverrides) {
  const allowed = imagesAllowed(product, merchantConfirmed);
  if (!overrides?.images) return allowed;
  const byUrl = new Map(allowed.map((img) => [img.url, img]));
  return [...new Set(overrides.images)].map((url) => byUrl.get(url)).filter((img): img is NonNullable<typeof img> => !!img);
}

export function buildProductSetInput(product: NormalizedProduct, options: BuildOptions): ProductSetInput {
  const ov = options.overrides ?? {};
  const images = finalImages(product, options.merchantConfirmedImageRights, ov);
  const imageUrls = new Set(images.map((i) => i.url));
  const title = ov.title?.trim() || product.title;

  const hasOptions = product.options.length > 0;
  const productOptions = hasOptions
    ? product.options.map((opt, idx) => ({
        name: opt.name,
        position: idx + 1,
        values: opt.values.map((name) => ({ name })),
      }))
    : [{ name: "Title", position: 1, values: [{ name: "Default Title" }] }];

  const variants = product.variants.map((variant) => {
    const pricing = options.pricing.get(variant.externalId);
    if (!pricing) throw new ProductSetBuildError(`Geen verkoopprijs voor variant ${variant.externalId}`);
    if (!/^\d+(\.\d{1,2})?$/.test(pricing.price)) {
      throw new ProductSetBuildError(`Ongeldige verkoopprijs "${pricing.price}" voor variant ${variant.externalId}`);
    }
    const inventoryItem: ProductSetInput["variants"][number]["inventoryItem"] = {
      // Voorraad wordt pas gevolgd zodra voorraadsynchronisatie (fase 6) actief is.
      tracked: false,
      requiresShipping: true,
    };
    if (pricing.unitCost) inventoryItem.cost = pricing.unitCost;
    if (product.countryOfOrigin) inventoryItem.countryCodeOfOrigin = product.countryOfOrigin;
    if (variant.weightGrams !== null) inventoryItem.measurement = { weight: { value: variant.weightGrams, unit: "GRAMS" } };

    const out: ProductSetInput["variants"][number] = {
      optionValues: hasOptions
        ? variant.options.map((o) => ({ optionName: o.name, name: o.value }))
        : [{ optionName: "Title", name: "Default Title" }],
      price: pricing.price,
      inventoryPolicy: "DENY",
      taxable: true,
      inventoryItem,
    };
    if (variant.sku) out.sku = variant.sku;
    if (variant.barcode) out.barcodes = [{ value: variant.barcode }];
    const variantImage = ov.variantImages && variant.externalId in ov.variantImages ? ov.variantImages[variant.externalId] : variant.imageUrl;
    if (variantImage && imageUrls.has(variantImage)) {
      out.file = { originalSource: variantImage, contentType: "IMAGE", alt: title };
    }
    return out;
  });

  const descriptionHtml = ov.descriptionHtml?.trim() || product.descriptionHtml;
  const vendor = ov.vendor?.trim() || product.vendor || product.brand || options.defaultVendor || undefined;
  const productType = ov.productType?.trim() || product.productType;
  const tags = [...new Set([...(ov.tags ?? product.tags), ...(options.extraTags ?? [])])];

  const input: ProductSetInput = {
    title,
    status: "DRAFT",
    productOptions,
    variants,
    metafields: [{ namespace: SOURCE_ID_NAMESPACE, key: SOURCE_ID_KEY, type: "id", value: options.sourceKey }],
  };
  if (descriptionHtml) input.descriptionHtml = descriptionHtml;
  if (vendor) input.vendor = vendor;
  if (productType) input.productType = productType;
  if (tags.length) input.tags = tags;
  const files = images.map((img) => ({ originalSource: img.url, contentType: "IMAGE" as const, alt: img.alt ?? title }));
  if (files.length) input.files = files;
  const collections = [...new Set(ov.collections ?? [])].filter((id) => /^gid:\/\/shopify\/Collection\/\d+$/.test(id));
  if (collections.length) input.collections = collections;
  const seoTitle = ov.seoTitle?.trim();
  const seoDescription = ov.seoDescription?.trim();
  if (seoTitle || seoDescription) {
    input.seo = { ...(seoTitle ? { title: seoTitle } : {}), ...(seoDescription ? { description: seoDescription } : {}) };
  }
  return input;
}
