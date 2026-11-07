/**
 * Importorkestratie.
 *
 * Stroom: bestand → voorbeeld (ImportJob status PREVIEW) → selectie → akkoord → verwerking.
 *
 * Garanties:
 * - Producten worden uitsluitend als CONCEPT (DRAFT) aangemaakt; er wordt nooit gepubliceerd.
 * - Bestaande Shopify-producten worden nooit overschreven (alleen nieuwe producten via productSet zonder identifier).
 * - Geen dubbele producten: (1) databasekoppeling per bron-sleutel, (2) unieke Shopify-metafield
 *   $app.source_id, (3) na een onderbroken poging wordt eerst in Shopify gezocht (productByIdentifier).
 * - Geen dubbele verwerking: elk item wordt atomair "geclaimd" voordat het naar Shopify gaat.
 * - Alle gegevens worden gefilterd op shopId (autorisatie per winkel).
 */
import type { ImportItemStatus, ImportJob, Prisma } from "@prisma/client";
import db from "../db.server";
import { checkProduct, hasBlockingFlag, type ProductFlag } from "../lib/import/compliance";
import { parseProductCsv } from "../lib/import/csv";
import { detectDuplicates } from "../lib/import/duplicates";
import { normalizedProductSchema, sourceKeyFor, type NormalizedProduct } from "../lib/import/types";
import {
  buildProductSetInput,
  imagesAllowed,
  PRODUCT_BY_SOURCE_ID_QUERY,
  PRODUCT_SET_CREATE_MUTATION,
  SOURCE_ID_KEY,
  SOURCE_ID_NAMESPACE,
  type VariantPricing,
} from "../lib/shopify/product-set";
import { logAudit } from "./audit.server";
import { runGraphql, type AdminGraphqlClient } from "./graphql.server";
import { priceProduct, toRuleCandidate, type ProductPricing } from "./pricing.server";
import { getSetting } from "./settings.server";
import { ensureSupplierRegistry } from "./suppliers.server";
import { getExchangeRates } from "./exchange-rates.server";

export const MAX_ATTEMPTS = 3;
/** Na deze tijd wordt een item in "IMPORTING" als onderbroken beschouwd en mag het opnieuw. */
export const STALE_CLAIM_MS = 10 * 60 * 1000;
/** Aantal producten per verwerkingsronde binnen één verzoek (achtergrondwachtrij volgt in fase 6). */
export const DEFAULT_BATCH_LIMIT = 25;

export interface ShopRef {
  id: string;
  currencyCode: string | null;
}

export interface ItemFlags {
  flags: ProductFlag[];
  blocking: boolean;
  duplicate: { reason: string; message: string } | null;
}

// ---------------------------------------------------------------------------
// 1. Voorbeeld aanmaken
// ---------------------------------------------------------------------------

export interface CreatePreviewInput {
  shop: ShopRef;
  userId: string | null;
  fileName: string;
  text: string;
  supplierKey: string;
  maxRows?: number;
  fetchImpl?: typeof fetch;
}

export async function createCsvPreview(input: CreatePreviewInput) {
  await ensureSupplierRegistry();
  const supplier = await db.supplier.findUniqueOrThrow({ where: { key: input.supplierKey } });
  if (supplier.integrationStatus !== "AVAILABLE") throw new Error(`Import via ${supplier.name} is nog niet beschikbaar.`);

  const shopCurrency = input.shop.currencyCode ?? "EUR";
  const parsed = parseProductCsv(input.text, {
    supplierKey: supplier.key,
    defaultCurrency: shopCurrency,
    maxRows: input.maxRows ?? Number(process.env.NOBLENEST_MAX_ROWS ?? 5000),
  });

  // Bestaande imports opzoeken voor duplicaatcontrole (alleen deze winkel).
  const keys = parsed.products.map((p) => sourceKeyFor(p.supplierKey, p.externalId));
  const urls = parsed.products.map((p) => p.sourceUrl).filter((u): u is string => !!u);
  const [mappedKeys, mappedUrls] = await Promise.all([
    db.shopifyProductMapping.findMany({ where: { shopId: input.shop.id, sourceKey: { in: keys } }, select: { sourceKey: true } }),
    urls.length
      ? db.supplierProduct.findMany({
          where: { shopId: input.shop.id, sourceUrl: { in: urls }, mapping: { isNot: null } },
          select: { sourceUrl: true },
        })
      : Promise.resolve([]),
  ]);
  const duplicates = detectDuplicates(parsed.products, {
    importedSourceKeys: new Set(mappedKeys.map((m) => m.sourceKey)),
    importedSourceUrls: new Set(mappedUrls.map((m) => m.sourceUrl!).filter(Boolean)),
  });

  const rules = (await db.pricingRule.findMany({ where: { shopId: input.shop.id } })).map(toRuleCandidate);
  const rates = await getExchangeRates(input.shop.id, input.fetchImpl);
  const context = { shopCurrency, exchangeRates: rates.rates };

  const items: Prisma.ImportJobItemCreateManyImportJobInput[] = parsed.products.map((product) => {
    const key = sourceKeyFor(product.supplierKey, product.externalId);
    const flags = checkProduct(product);
    const pricing = priceProduct(product, rules, context, supplier.id);
    if (!pricing.ok) {
      flags.unshift({ code: "NO_COST_PRICE", severity: "error", message: pricing.messages[0] ?? "Geen geldige verkoopprijs." });
    }
    const duplicate = duplicates.get(key) ?? null;
    if (duplicate) flags.unshift({ code: "DUPLICATE", severity: "error", message: duplicate.message });
    const dedupedFlags = dedupeFlags(flags);
    const blocking = hasBlockingFlag(dedupedFlags);
    const itemFlags: ItemFlags = { flags: dedupedFlags, blocking, duplicate: duplicate ? { reason: duplicate.reason, message: duplicate.message } : null };
    return {
      externalId: product.externalId,
      title: product.title,
      payload: product as unknown as Prisma.InputJsonValue,
      flags: itemFlags as unknown as Prisma.InputJsonValue,
      pricing: pricing as unknown as Prisma.InputJsonValue,
      selected: !blocking,
      duplicateOf: duplicate?.reference ?? null,
      status: duplicate ? "SKIPPED_DUPLICATE" : "PENDING",
    };
  });

  const job = await db.importJob.create({
    data: {
      shopId: input.shop.id,
      createdById: input.userId,
      type: "CSV",
      status: "PREVIEW",
      sourceName: input.fileName.slice(0, 255),
      supplierKey: supplier.key,
      totalItems: items.length,
      skippedItems: items.filter((i) => i.status === "SKIPPED_DUPLICATE").length,
      parseErrors: parsed.errors as unknown as Prisma.InputJsonValue,
      items: { createMany: { data: items } },
    },
  });

  await logAudit({
    shopId: input.shop.id,
    actorUserId: input.userId,
    action: "import.preview.created",
    entityType: "ImportJob",
    entityId: job.id,
    level: parsed.errors.length ? "WARNING" : "INFO",
    message: `CSV "${job.sourceName}" ingelezen: ${items.length} producten, ${parsed.errors.length} regelfout(en).`,
    metadata: { totalRows: parsed.totalRows, products: items.length, errors: parsed.errors.length, rates: rates.source, ratesWarning: rates.warning },
  });

  return { job, ratesWarning: rates.warning };
}

function dedupeFlags(flags: ProductFlag[]): ProductFlag[] {
  const seen = new Set<string>();
  return flags.filter((f) => (seen.has(f.code) ? false : (seen.add(f.code), true)));
}

// ---------------------------------------------------------------------------
// 2. Selectie
// ---------------------------------------------------------------------------

export async function getJob(shopId: string, jobId: string) {
  return db.importJob.findFirst({ where: { id: jobId, shopId }, include: { items: { orderBy: { createdAt: "asc" } } } });
}

/** Zet de selectie; producten met blokkerende meldingen of duplicaten kunnen nooit worden geselecteerd. */
export async function setSelection(shopId: string, jobId: string, selectedItemIds: string[]) {
  const job = await db.importJob.findFirst({ where: { id: jobId, shopId }, include: { items: true } });
  if (!job) throw new Error("Import niet gevonden");
  if (job.status !== "PREVIEW") throw new Error("De selectie kan alleen worden aangepast vóór het starten van de import.");
  const wanted = new Set(selectedItemIds);
  const allowed = job.items.filter((item) => !(item.flags as unknown as ItemFlags).blocking && item.status === "PENDING");
  await db.$transaction([
    db.importJobItem.updateMany({ where: { importJobId: job.id }, data: { selected: false } }),
    db.importJobItem.updateMany({
      where: { importJobId: job.id, id: { in: allowed.filter((i) => wanted.has(i.id)).map((i) => i.id) } },
      data: { selected: true },
    }),
  ]);
}

// ---------------------------------------------------------------------------
// 3. Starten, verwerken, annuleren, opnieuw proberen
// ---------------------------------------------------------------------------

export interface RunOptions {
  imageRightsConfirmed: boolean;
  userId: string | null;
  batchLimit?: number;
}

/** Start een import na akkoord van de winkelier (eenmalig: PREVIEW → QUEUED). */
export async function startImport(shopId: string, jobId: string, client: AdminGraphqlClient, options: RunOptions) {
  const selectedCount = await db.importJobItem.count({ where: { importJobId: jobId, importJob: { shopId }, selected: true, status: "PENDING" } });
  if (selectedCount === 0) throw new Error("Selecteer ten minste één product om te importeren.");

  const claimed = await db.importJob.updateMany({
    where: { id: jobId, shopId, status: "PREVIEW" },
    data: { status: "QUEUED", imageRightsConfirmed: options.imageRightsConfirmed, startedAt: new Date() },
  });
  if (claimed.count === 0) throw new Error("Deze import is al gestart of afgerond.");

  // Niet-geselecteerde items expliciet overslaan.
  const skipped = await db.importJobItem.updateMany({
    where: { importJobId: jobId, selected: false, status: "PENDING" },
    data: { status: "CANCELLED", lastError: "Niet geselecteerd" },
  });
  await db.importJob.update({ where: { id: jobId }, data: { skippedItems: { increment: skipped.count } } });

  await logAudit({
    shopId,
    actorUserId: options.userId,
    action: "import.started",
    entityType: "ImportJob",
    entityId: jobId,
    message: `Import gestart voor ${selectedCount} product(en) als concept${options.imageRightsConfirmed ? ", beeldrechten bevestigd door winkelier" : ""}.`,
    metadata: { selected: selectedCount, imageRightsConfirmed: options.imageRightsConfirmed },
  });

  return processJob(shopId, jobId, client, options);
}

/** Verwerkt de volgende batch openstaande items. Kan veilig opnieuw worden aangeroepen. */
export async function processJob(shopId: string, jobId: string, client: AdminGraphqlClient, options: RunOptions) {
  const job = await db.importJob.findFirst({ where: { id: jobId, shopId } });
  if (!job) throw new Error("Import niet gevonden");
  if (!["QUEUED", "RUNNING", "PAUSED"].includes(job.status)) return summarize(job.id);

  await db.importJob.update({ where: { id: job.id }, data: { status: "RUNNING" } });
  const limit = options.batchLimit ?? DEFAULT_BATCH_LIMIT;
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS);

  const candidates = await db.importJobItem.findMany({
    where: {
      importJobId: job.id,
      selected: true,
      OR: [{ status: "PENDING" }, { status: "IMPORTING", updatedAt: { lt: staleBefore } }],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  for (const item of candidates) {
    // Annulering tussentijds respecteren.
    const current = await db.importJob.findUnique({ where: { id: job.id }, select: { status: true } });
    if (current?.status === "CANCELLED") break;
    await processItem(job, item.id, client, options.userId);
  }

  return finalizeJob(job.id);
}

async function finalizeJob(jobId: string) {
  const job = await db.importJob.findUniqueOrThrow({ where: { id: jobId } });
  if (job.status === "CANCELLED") return summarize(jobId);
  const remaining = await db.importJobItem.count({
    where: { importJobId: jobId, selected: true, status: { in: ["PENDING", "IMPORTING"] } },
  });
  if (remaining > 0) {
    await db.importJob.update({ where: { id: jobId }, data: { status: "PAUSED" } });
  } else {
    const failed = await db.importJobItem.count({ where: { importJobId: jobId, status: "FAILED" } });
    const succeeded = await db.importJobItem.count({ where: { importJobId: jobId, status: "IMPORTED" } });
    await db.importJob.update({
      where: { id: jobId },
      data: {
        status: failed === 0 ? "COMPLETED" : succeeded === 0 ? "FAILED" : "COMPLETED_WITH_ERRORS",
        finishedAt: new Date(),
      },
    });
  }
  return summarize(jobId);
}

export async function summarize(jobId: string) {
  const job = await db.importJob.findUniqueOrThrow({ where: { id: jobId } });
  const counts = await db.importJobItem.groupBy({ by: ["status"], where: { importJobId: jobId }, _count: true });
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count])) as Partial<Record<ImportItemStatus, number>>;
  return { status: job.status, byStatus };
}

export async function cancelImport(shopId: string, jobId: string, userId: string | null) {
  const result = await db.importJob.updateMany({
    where: { id: jobId, shopId, status: { in: ["PREVIEW", "QUEUED", "RUNNING", "PAUSED"] } },
    data: { status: "CANCELLED", finishedAt: new Date() },
  });
  if (result.count === 0) throw new Error("Deze import kan niet meer worden geannuleerd.");
  const cancelled = await db.importJobItem.updateMany({
    where: { importJobId: jobId, status: "PENDING" },
    data: { status: "CANCELLED", lastError: "Geannuleerd door gebruiker" },
  });
  await logAudit({
    shopId,
    actorUserId: userId,
    action: "import.cancelled",
    entityType: "ImportJob",
    entityId: jobId,
    level: "WARNING",
    message: `Import geannuleerd; ${cancelled.count} openstaande product(en) niet uitgevoerd.`,
  });
}

/** Zet mislukte items terug in de wachtrij (tot MAX_ATTEMPTS pogingen) en verwerkt ze opnieuw. */
export async function retryFailed(shopId: string, jobId: string, client: AdminGraphqlClient, options: RunOptions) {
  const job = await db.importJob.findFirst({ where: { id: jobId, shopId } });
  if (!job) throw new Error("Import niet gevonden");
  if (!["COMPLETED_WITH_ERRORS", "FAILED", "PAUSED"].includes(job.status)) {
    throw new Error("Er zijn geen mislukte producten om opnieuw te proberen.");
  }
  const reset = await db.importJobItem.updateMany({
    where: { importJobId: jobId, status: "FAILED", attempts: { lt: MAX_ATTEMPTS } },
    data: { status: "PENDING" },
  });
  if (reset.count === 0) throw new Error(`Geen producten meer om opnieuw te proberen (maximaal ${MAX_ATTEMPTS} pogingen).`);
  await db.importJob.update({
    where: { id: jobId },
    data: { status: "QUEUED", finishedAt: null, failedItems: { decrement: reset.count } },
  });
  await logAudit({
    shopId,
    actorUserId: options.userId,
    action: "import.retry",
    entityType: "ImportJob",
    entityId: jobId,
    message: `${reset.count} mislukt(e) product(en) opnieuw in de wachtrij gezet.`,
  });
  return processJob(shopId, jobId, client, { ...options, imageRightsConfirmed: job.imageRightsConfirmed });
}

// ---------------------------------------------------------------------------
// 4. Eén item verwerken
// ---------------------------------------------------------------------------

interface ProductSetResponse {
  productSet: {
    product: { id: string; handle: string; status: string; variants: { nodes: { id: string; sku: string | null; selectedOptions: { name: string; value: string }[] }[] } } | null;
    userErrors: { field: string[] | null; message: string; code: string | null }[];
  } | null;
}

interface LookupResponse {
  productByIdentifier: { id: string; handle: string; status: string } | null;
}

async function processItem(job: ImportJob, itemId: string, client: AdminGraphqlClient, userId: string | null) {
  // Atomair claimen: voorkomt dubbele verwerking bij gelijktijdige verzoeken.
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS);
  const claim = await db.importJobItem.updateMany({
    where: {
      id: itemId,
      importJobId: job.id,
      selected: true,
      attempts: { lt: MAX_ATTEMPTS },
      OR: [{ status: "PENDING" }, { status: "IMPORTING", updatedAt: { lt: staleBefore } }],
    },
    data: { status: "IMPORTING", attempts: { increment: 1 }, lastError: null },
  });
  if (claim.count === 0) return;

  const item = await db.importJobItem.findUniqueOrThrow({ where: { id: itemId } });
  const product = normalizedProductSchema.parse(item.payload);
  const key = sourceKeyFor(product.supplierKey, product.externalId);
  const pricing = item.pricing as unknown as ProductPricing | null;

  const fail = async (message: string) => {
    await db.$transaction([
      db.importJobItem.update({ where: { id: item.id }, data: { status: "FAILED", lastError: message.slice(0, 2000) } }),
      db.importJob.update({ where: { id: job.id }, data: { failedItems: { increment: 1 } } }),
    ]);
    await logAudit({
      shopId: job.shopId,
      actorUserId: userId,
      level: "ERROR",
      action: "import.item.failed",
      entityType: "ImportJobItem",
      entityId: item.id,
      message: `Import mislukt voor "${product.title}": ${message}`,
      metadata: { sourceKey: key, attempt: item.attempts },
    });
  };

  // (1) Al gekoppeld in de database? Dan nooit opnieuw aanmaken.
  const existingMapping = await db.shopifyProductMapping.findUnique({ where: { shopId_sourceKey: { shopId: job.shopId, sourceKey: key } } });
  if (existingMapping) {
    await db.$transaction([
      db.importJobItem.update({
        where: { id: item.id },
        data: { status: "SKIPPED_DUPLICATE", shopifyProductId: existingMapping.shopifyProductId, lastError: "Al geïmporteerd" },
      }),
      db.importJob.update({ where: { id: job.id }, data: { skippedItems: { increment: 1 } } }),
    ]);
    return;
  }

  // Verkoopprijzen = de prijzen die de winkelier in het voorbeeld heeft goedgekeurd.
  const variantPricing = new Map<string, VariantPricing>();
  for (const variant of product.variants) {
    const calc = pricing?.variants?.[variant.externalId];
    if (!calc?.ok || !calc.breakdown) {
      await fail(`Geen geldige verkoopprijs voor variant ${variant.externalId}.`);
      return;
    }
    variantPricing.set(variant.externalId, { price: calc.breakdown.sellingPrice, unitCost: calc.breakdown.landedCost });
  }

  // Bronproduct (leveranciersgegevens) vastleggen, gescheiden van Shopify.
  const supplier = await db.supplier.findUniqueOrThrow({ where: { key: product.supplierKey } });
  const supplierProduct = await upsertSupplierProduct(job.shopId, supplier.id, product, item.flags as unknown as ItemFlags);
  await db.importJobItem.update({ where: { id: item.id }, data: { supplierProductId: supplierProduct.id } });

  // (2) Bestaat het product al in Shopify (bv. na een onderbroken eerdere poging of import)?
  //     Zo ja: alleen koppelen, nooit opnieuw aanmaken of overschrijven.
  const lookup = await runGraphql<LookupResponse>(client, PRODUCT_BY_SOURCE_ID_QUERY, {
    identifier: { customId: { namespace: SOURCE_ID_NAMESPACE, key: SOURCE_ID_KEY, value: key } },
  });
  if (lookup.transportError) {
    await fail(lookup.errors.join("; "));
    return;
  }
  const found = lookup.data?.productByIdentifier;
  if (found) {
    await recordSuccess(job, item.id, supplierProduct.id, key, found, [], variantPricing, product, userId, true);
    return;
  }
  // GraphQL-fouten bij het opzoeken (bv. metafield-definitie nog niet uitgerold) blokkeren niet:
  // de unieke metafield-waarde voorkomt in Shopify alsnog een dubbel product.

  const prefs = await getSetting(job.shopId, "import.preferences");
  let input;
  try {
    input = buildProductSetInput(product, {
      sourceKey: key,
      pricing: variantPricing,
      merchantConfirmedImageRights: job.imageRightsConfirmed,
      defaultVendor: prefs.defaultVendor,
      extraTags: prefs.extraTags,
      overrides: {
        title: supplierProduct.aiTitle,
        descriptionHtml: supplierProduct.aiDescriptionHtml,
        seoTitle: supplierProduct.seoTitle,
        seoDescription: supplierProduct.seoDescription,
      },
    });
  } catch (error) {
    await fail(error instanceof Error ? error.message : String(error));
    return;
  }

  // (3) Nieuw product aanmaken — altijd als concept.
  const result = await runGraphql<ProductSetResponse>(client, PRODUCT_SET_CREATE_MUTATION, { input });
  if (result.errors.length) {
    await fail(result.transportError ? `${result.errors.join("; ")} (uitkomst onbekend; wordt bij opnieuw proberen eerst gecontroleerd)` : `Shopify: ${result.errors.join("; ")}`);
    return;
  }
  const payload = result.data?.productSet;
  const userErrors = payload?.userErrors ?? [];
  if (userErrors.length || !payload?.product) {
    await fail(translateUserErrors(userErrors));
    return;
  }

  await recordSuccess(job, item.id, supplierProduct.id, key, payload.product, payload.product.variants.nodes, variantPricing, product, userId, false);
}

function translateUserErrors(errors: { field: string[] | null; message: string; code: string | null }[]): string {
  if (!errors.length) return "Shopify gaf geen product terug.";
  return errors
    .map((e) => {
      const field = e.field?.join(".") ?? "";
      if (/metafield/i.test(field) || /metafield/i.test(e.message)) {
        return `Shopify (metafield bron-ID): ${e.message} — controleer of de app-configuratie is uitgerold (npm run deploy).`;
      }
      if (/media|file|image/i.test(field)) return `Shopify (afbeelding): ${e.message}`;
      return `Shopify${field ? ` (${field})` : ""}: ${e.message}`;
    })
    .join("; ");
}

async function upsertSupplierProduct(shopId: string, supplierId: string, product: NormalizedProduct, itemFlags: ItemFlags) {
  return db.$transaction(async (tx) => {
    const data = {
      sourceUrl: product.sourceUrl,
      title: product.title,
      descriptionHtml: product.descriptionHtml,
      vendor: product.vendor,
      brand: product.brand,
      productType: product.productType,
      tags: product.tags,
      gtin: product.gtin,
      currencyCode: product.currencyCode,
      costPrice: minCost(product),
      shippingCost: product.shippingCost,
      deliveryDaysMin: product.deliveryDaysMin,
      deliveryDaysMax: product.deliveryDaysMax,
      stockStatus: product.stockStatus,
      safetyInfo: product.safetyInfo,
      euResponsiblePerson: product.euResponsiblePerson,
      countryOfOrigin: product.countryOfOrigin,
      rawData: product.raw as unknown as Prisma.InputJsonValue,
      complianceFlags: itemFlags.flags as unknown as Prisma.InputJsonValue,
      lastSeenAt: new Date(),
    };
    const sp = await tx.supplierProduct.upsert({
      where: { shopId_supplierId_externalId: { shopId, supplierId, externalId: product.externalId } },
      create: { shopId, supplierId, externalId: product.externalId, ...data },
      // AI-velden (aiTitle, seoTitle, …) worden bewust niet aangeraakt.
      update: data,
    });
    await tx.productVariant.deleteMany({ where: { supplierProductId: sp.id } });
    await tx.productVariant.createMany({
      data: product.variants.map((v, position) => ({
        supplierProductId: sp.id,
        externalId: v.externalId,
        sku: v.sku,
        barcode: v.barcode,
        options: v.options,
        costPrice: v.costPrice,
        stockQuantity: v.stockQuantity,
        stockStatus: v.stockStatus,
        weightGrams: v.weightGrams,
        imageSourceUrl: v.imageUrl,
        position,
      })),
    });
    await tx.productImage.deleteMany({ where: { supplierProductId: sp.id } });
    await tx.productImage.createMany({
      data: product.images.map((img, position) => ({
        supplierProductId: sp.id,
        sourceUrl: img.url,
        altText: img.alt,
        position,
        rightsStatus: img.rights,
      })),
    });
    return sp;
  });
}

function minCost(product: NormalizedProduct): string | null {
  const costs = product.variants.map((v) => v.costPrice).filter((c): c is string => c !== null).map(Number);
  return costs.length ? String(Math.min(...costs)) : null;
}

async function recordSuccess(
  job: ImportJob,
  itemId: string,
  supplierProductId: string,
  sourceKey: string,
  shopifyProduct: { id: string; handle: string; status: string },
  shopifyVariants: { id: string; sku: string | null; selectedOptions: { name: string; value: string }[] }[],
  pricing: Map<string, VariantPricing>,
  product: NormalizedProduct,
  userId: string | null,
  recovered: boolean,
) {
  const prices = [...pricing.values()].map((p) => Number(p.price));
  const allowedImages = new Set(imagesAllowed(product, job.imageRightsConfirmed).map((i) => i.url));

  await db.$transaction(async (tx) => {
    await tx.shopifyProductMapping.create({
      data: {
        shopId: job.shopId,
        supplierProductId,
        shopifyProductId: shopifyProduct.id,
        shopifyHandle: shopifyProduct.handle,
        shopifyStatus: shopifyProduct.status,
        sourceKey,
        sellingPrice: prices.length ? Math.min(...prices).toFixed(2) : null,
        lastSyncedAt: new Date(),
      },
    });
    await tx.supplierProduct.update({ where: { id: supplierProductId }, data: { status: "IMPORTED" } });
    await tx.productImage.updateMany({
      where: { supplierProductId, sourceUrl: { in: [...allowedImages] } },
      data: { importedToShopify: true },
    });
    if (job.imageRightsConfirmed) {
      await tx.productImage.updateMany({
        where: { supplierProductId, rightsStatus: "UNVERIFIED" },
        data: { rightsStatus: "CONFIRMED_BY_MERCHANT" },
      });
    }
    // Shopify-variant-ID's koppelen aan bronvarianten (via optiewaarden).
    for (const variant of product.variants) {
      const match = shopifyVariants.find((sv) =>
        product.options.length === 0
          ? true
          : variant.options.every((o) => sv.selectedOptions.some((so) => so.name === o.name && so.value === o.value)),
      );
      if (match) {
        await tx.productVariant.updateMany({
          where: { supplierProductId, externalId: variant.externalId },
          data: { shopifyVariantId: match.id },
        });
      }
    }
    await tx.importJobItem.update({ where: { id: itemId }, data: { status: "IMPORTED", shopifyProductId: shopifyProduct.id, lastError: null } });
    await tx.importJob.update({ where: { id: job.id }, data: { succeededItems: { increment: 1 } } });
  });

  await logAudit({
    shopId: job.shopId,
    actorUserId: userId,
    action: recovered ? "import.item.recovered" : "import.item.created",
    entityType: "ShopifyProduct",
    entityId: shopifyProduct.id,
    message: recovered
      ? `"${product.title}" bestond al in Shopify na een onderbroken poging en is gekoppeld (niet opnieuw aangemaakt).`
      : `"${product.title}" als concept aangemaakt in Shopify.`,
    metadata: { sourceKey, status: shopifyProduct.status },
  });
}
