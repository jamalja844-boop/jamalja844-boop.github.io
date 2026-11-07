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
  /** AI-teksten gebruiken in plaats van bronteksten (alleen als ze bestaan) */
  overrides?: { title?: string | null; descriptionHtml?: string | null; seoTitle?: string | null; seoDescription?: string | null };
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

export function buildProductSetInput(product: NormalizedProduct, options: BuildOptions): ProductSetInput {
  const allowedImages = imagesAllowed(product, options.merchantConfirmedImageRights);
  const allowedUrls = new Set(allowedImages.map((i) => i.url));

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
    if (variant.imageUrl && allowedUrls.has(variant.imageUrl)) {
      out.file = { originalSource: variant.imageUrl, contentType: "IMAGE", alt: product.title };
    }
    return out;
  });

  const title = options.overrides?.title?.trim() || product.title;
  const descriptionHtml = options.overrides?.descriptionHtml?.trim() || product.descriptionHtml;
  const vendor = product.vendor ?? product.brand ?? options.defaultVendor ?? undefined;
  const tags = [...new Set([...product.tags, ...(options.extraTags ?? [])])];

  const input: ProductSetInput = {
    title,
    status: "DRAFT",
    productOptions,
    variants,
    metafields: [{ namespace: SOURCE_ID_NAMESPACE, key: SOURCE_ID_KEY, type: "id", value: options.sourceKey }],
  };
  if (descriptionHtml) input.descriptionHtml = descriptionHtml;
  if (vendor) input.vendor = vendor;
  if (product.productType) input.productType = product.productType;
  if (tags.length) input.tags = tags;
  const variantFileUrls = new Set(variants.map((v) => v.file?.originalSource).filter(Boolean));
  const files = allowedImages
    .filter((img) => !variantFileUrls.has(img.url))
    .map((img) => ({ originalSource: img.url, contentType: "IMAGE" as const, ...(img.alt ? { alt: img.alt } : {}) }));
  if (files.length) input.files = files;
  const seoTitle = options.overrides?.seoTitle?.trim();
  const seoDescription = options.overrides?.seoDescription?.trim();
  if (seoTitle || seoDescription) {
    input.seo = { ...(seoTitle ? { title: seoTitle } : {}), ...(seoDescription ? { description: seoDescription } : {}) };
  }
  return input;
}
