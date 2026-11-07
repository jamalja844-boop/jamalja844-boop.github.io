import type { PricingRule, Prisma } from "@prisma/client";
import { z } from "zod";
import db from "../db.server";
import {
  calculatePrice,
  selectPricingRule,
  type PriceCalculation,
  type PricingContext,
  type RuleCandidate,
} from "../lib/pricing/calculator";
import type { NormalizedProduct } from "../lib/import/types";

const decimalString = z
  .string()
  .trim()
  .transform((s) => s.replace(",", "."))
  .refine((s) => s === "" || /^\d+(\.\d+)?$/.test(s), "Voer een geldig positief getal in");
const optionalDecimal = decimalString.transform((s) => (s === "" ? null : s));

export const pricingRuleFormSchema = z.object({
  name: z.string().trim().min(1, "Naam is verplicht").max(100),
  isActive: z.boolean(),
  priority: z.coerce.number().int().min(0).max(10000),
  scope: z.enum(["GLOBAL", "CATEGORY", "SUPPLIER"]),
  category: z.string().trim().max(255).optional().transform((s) => s || null),
  supplierId: z.string().trim().optional().transform((s) => s || null),
  strategy: z.enum(["FIXED_MARKUP", "PERCENTAGE_MARKUP", "TARGET_MARGIN"]),
  value: decimalString.refine((s) => s !== "", "Waarde is verplicht"),
  minimumPrice: optionalDecimal,
  rounding: z.enum(["NONE", "END_95", "END_99"]),
  defaultShippingCost: optionalDecimal,
  importDutyPercent: optionalDecimal,
  paymentFeePercent: optionalDecimal,
  paymentFeeFixed: optionalDecimal,
  platformFeePercent: optionalDecimal,
  otherCosts: optionalDecimal,
  vatPercent: optionalDecimal,
  pricesIncludeVat: z.boolean(),
}).superRefine((rule, ctx) => {
  if (rule.scope === "CATEGORY" && !rule.category) {
    ctx.addIssue({ code: "custom", path: ["category"], message: "Kies een categorie (producttype)" });
  }
  if (rule.scope === "SUPPLIER" && !rule.supplierId) {
    ctx.addIssue({ code: "custom", path: ["supplierId"], message: "Kies een leverancier" });
  }
  if (rule.strategy === "TARGET_MARGIN" && Number(rule.value) >= 100) {
    ctx.addIssue({ code: "custom", path: ["value"], message: "Een doelmarge moet lager zijn dan 100%" });
  }
});
export type PricingRuleForm = z.infer<typeof pricingRuleFormSchema>;

export function toRuleCandidate(rule: PricingRule): RuleCandidate {
  const s = (d: Prisma.Decimal | null) => (d === null ? null : d.toString());
  return {
    id: rule.id,
    name: rule.name,
    isActive: rule.isActive,
    priority: rule.priority,
    scope: rule.scope,
    category: rule.category,
    supplierId: rule.supplierId,
    strategy: rule.strategy,
    value: rule.value.toString(),
    minimumPrice: s(rule.minimumPrice),
    rounding: rule.rounding,
    defaultShippingCost: s(rule.defaultShippingCost),
    importDutyPercent: s(rule.importDutyPercent),
    paymentFeePercent: s(rule.paymentFeePercent),
    paymentFeeFixed: s(rule.paymentFeeFixed),
    platformFeePercent: s(rule.platformFeePercent),
    otherCosts: s(rule.otherCosts),
    vatPercent: s(rule.vatPercent),
    pricesIncludeVat: rule.pricesIncludeVat,
  };
}

export async function listPricingRules(shopId: string) {
  return db.pricingRule.findMany({ where: { shopId }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }], include: { supplier: true } });
}

export async function savePricingRule(shopId: string, form: PricingRuleForm, ruleId?: string) {
  if (form.supplierId) {
    const exists = await db.supplier.findUnique({ where: { id: form.supplierId } });
    if (!exists) throw new Error("Onbekende leverancier");
  }
  const data = { ...form, shopId };
  if (ruleId) {
    // Autorisatie per winkel: alleen regels van deze winkel bijwerken.
    const result = await db.pricingRule.updateMany({ where: { id: ruleId, shopId }, data });
    if (result.count === 0) throw new Error("Prijsregel niet gevonden");
    return db.pricingRule.findFirstOrThrow({ where: { id: ruleId, shopId } });
  }
  return db.pricingRule.create({ data });
}

export async function deletePricingRule(shopId: string, ruleId: string) {
  const result = await db.pricingRule.deleteMany({ where: { id: ruleId, shopId } });
  if (result.count === 0) throw new Error("Prijsregel niet gevonden");
}

export interface ProductPricing {
  ruleId: string | null;
  ruleName: string | null;
  variants: Record<string, PriceCalculation>;
  /** Laagste en hoogste verkoopprijs over de varianten */
  minPrice: string | null;
  maxPrice: string | null;
  ok: boolean;
  messages: string[];
}

export function priceProduct(
  product: NormalizedProduct,
  rules: RuleCandidate[],
  context: PricingContext,
  supplierId: string | null,
): ProductPricing {
  const rule = selectPricingRule(rules, { productType: product.productType, supplierId });
  if (!rule) {
    return {
      ruleId: null,
      ruleName: null,
      variants: {},
      minPrice: null,
      maxPrice: null,
      ok: false,
      messages: ["Geen actieve prijsregel — stel eerst een prijsregel in."],
    };
  }
  const variants: Record<string, PriceCalculation> = {};
  for (const variant of product.variants) {
    variants[variant.externalId] = calculatePrice(
      { costPrice: variant.costPrice, currencyCode: product.currencyCode, shippingCost: product.shippingCost },
      rule,
      context,
    );
  }
  const calcs = Object.values(variants);
  const prices = calcs.filter((c) => c.ok).map((c) => Number(c.breakdown!.sellingPrice));
  const messages = [...new Set(calcs.flatMap((c) => c.issues.map((i) => i.message)))];
  return {
    ruleId: rule.id,
    ruleName: rule.name ?? null,
    variants,
    minPrice: prices.length ? Math.min(...prices).toFixed(2) : null,
    maxPrice: prices.length ? Math.max(...prices).toFixed(2) : null,
    ok: calcs.length > 0 && calcs.every((c) => c.ok),
    messages,
  };
}
