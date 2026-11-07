/**
 * Bewerken van een product in het importvoorbeeld (vóór import).
 *
 * - Alleen mogelijk zolang de import nog in "Voorbeeld" staat en het product nog niet is verwerkt.
 * - Teksten, foto's, collecties en handmatige prijzen worden opgeslagen als `overrides`;
 *   de oorspronkelijke leveranciersgegevens (`payload`) blijven ongewijzigd.
 * - Handmatige prijzen worden doorgerekend met dezelfde prijsregel (kostprijs, btw, winst, marge).
 */
import type { Prisma } from "@prisma/client";
import db from "../db.server";
import { calculatePrice, type PriceCalculation } from "../lib/pricing/calculator";
import { itemOverridesSchema, type ItemOverrides } from "../lib/import/overrides";
import { normalizedProductSchema } from "../lib/import/types";
import { logAudit } from "./audit.server";
import type { ItemFlags } from "./import.server";
import { getExchangeRates } from "./exchange-rates.server";
import { toRuleCandidate, type ProductPricing } from "./pricing.server";

export interface StoredPricing extends ProductPricing {
  /** Automatisch berekende prijzen, bewaard zodra een handmatige prijs is ingesteld */
  originalVariants?: Record<string, PriceCalculation>;
  /** Externe variant-ID's met een handmatige prijs */
  manualVariants?: string[];
}

export interface EditInput {
  overrides: unknown;
  /** Handmatige prijs per externe variant-ID; lege string of null = automatische prijs */
  prices: Record<string, string | null>;
}

export class EditError extends Error {}

export async function getEditableItem(shopId: string, jobId: string, itemId: string) {
  const item = await db.importJobItem.findFirst({
    where: { id: itemId, importJobId: jobId, importJob: { shopId } },
    include: { importJob: true },
  });
  return item;
}

export async function saveItemEdits(shopId: string, jobId: string, itemId: string, input: EditInput, userId: string | null, fetchImpl?: typeof fetch) {
  const item = await getEditableItem(shopId, jobId, itemId);
  if (!item) throw new EditError("Product niet gevonden.");
  if (item.importJob.status !== "PREVIEW") throw new EditError("Bewerken kan alleen vóór het starten van de import.");
  if (item.status !== "PENDING") throw new EditError("Dit product wordt niet geïmporteerd en kan niet worden bewerkt.");

  const product = normalizedProductSchema.parse(item.payload);
  const parsed = itemOverridesSchema.safeParse(input.overrides);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new EditError(`${issue?.path.join(".") || "Invoer"}: ${issue?.message ?? "ongeldig"}`);
  }
  const overrides: ItemOverrides = parsed.data;

  // Afbeeldingen en variantfoto's moeten bij dit product horen.
  const productUrls = new Set(product.images.map((i) => i.url));
  if (overrides.images?.some((u) => !productUrls.has(u))) throw new EditError("Onbekende afbeelding geselecteerd.");
  const variantIds = new Set(product.variants.map((v) => v.externalId));
  for (const [variantId, url] of Object.entries(overrides.variantImages ?? {})) {
    if (!variantIds.has(variantId)) throw new EditError("Onbekende variant.");
    if (url && !productUrls.has(url)) throw new EditError("Onbekende variantafbeelding.");
    if (url && overrides.images && !overrides.images.includes(url)) {
      throw new EditError("Een variantafbeelding moet ook bij de geselecteerde afbeeldingen staan.");
    }
  }

  // Prijzen herberekenen.
  const pricing = item.pricing as unknown as StoredPricing | null;
  if (!pricing?.ruleId) throw new EditError("Dit product heeft geen prijsregel; handmatige prijzen zijn niet mogelijk.");
  const rule = await db.pricingRule.findFirst({ where: { id: pricing.ruleId, shopId } });
  const wantsManual = Object.values(input.prices).some((p) => p !== null && p !== undefined && String(p).trim() !== "");
  const nextVariants: Record<string, PriceCalculation> = { ...pricing.variants };
  const original: Record<string, PriceCalculation> = { ...(pricing.originalVariants ?? pricing.variants) };
  const manual: string[] = [];
  const warnings: string[] = [];

  if (wantsManual && !rule) throw new EditError("De prijsregel van dit voorbeeld bestaat niet meer. Lees het bestand opnieuw in.");
  const rates = wantsManual ? await getExchangeRates(shopId, fetchImpl) : null;
  const shopCurrency = (await db.shop.findUnique({ where: { id: shopId }, select: { currencyCode: true } }))?.currencyCode ?? "EUR";

  for (const variant of product.variants) {
    const raw = input.prices[variant.externalId];
    const value = raw === null || raw === undefined ? "" : String(raw).trim().replace(",", ".");
    if (value === "") {
      nextVariants[variant.externalId] = original[variant.externalId]!;
      continue;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(value) || Number(value) <= 0) {
      throw new EditError(`Ongeldige prijs "${raw}" voor variant ${variant.externalId}. Gebruik bv. 49,95.`);
    }
    const calc = calculatePrice(
      { costPrice: variant.costPrice, currencyCode: product.currencyCode, shippingCost: product.shippingCost },
      toRuleCandidate(rule!),
      { shopCurrency, exchangeRates: rates!.rates },
      { fixedSellingPrice: value },
    );
    if (!calc.ok) throw new EditError(calc.issues[0]?.message ?? `Prijs voor ${variant.externalId} kan niet worden berekend.`);
    if (calc.issues.some((i) => i.code === "NEGATIVE_MARGIN")) warnings.push(`${variant.externalId}: ${calc.issues.find((i) => i.code === "NEGATIVE_MARGIN")!.message}`);
    nextVariants[variant.externalId] = calc;
    manual.push(variant.externalId);
  }

  const prices = Object.values(nextVariants).filter((c) => c.ok).map((c) => Number(c.breakdown!.sellingPrice));
  const nextPricing: StoredPricing = {
    ...pricing,
    variants: nextVariants,
    minPrice: prices.length ? Math.min(...prices).toFixed(2) : null,
    maxPrice: prices.length ? Math.max(...prices).toFixed(2) : null,
    ok: Object.values(nextVariants).every((c) => c.ok),
    originalVariants: manual.length ? original : undefined,
    manualVariants: manual.length ? manual : undefined,
  };

  // Lege overrides niet opslaan.
  const cleaned = Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined)) as ItemOverrides;
  await db.importJobItem.update({
    where: { id: item.id },
    data: {
      overrides: Object.keys(cleaned).length ? (cleaned as Prisma.InputJsonValue) : undefined,
      pricing: nextPricing as unknown as Prisma.InputJsonValue,
    },
  });

  await logAudit({
    shopId,
    actorUserId: userId,
    action: "import.item.edited",
    entityType: "ImportJobItem",
    entityId: item.id,
    message: `"${overrides.title ?? product.title}" bewerkt in het voorbeeld${manual.length ? ` (${manual.length} handmatige prijs/prijzen)` : ""}.`,
    metadata: { fields: Object.keys(cleaned), manualPrices: manual.length },
  });

  return { warnings, flags: item.flags as unknown as ItemFlags };
}
