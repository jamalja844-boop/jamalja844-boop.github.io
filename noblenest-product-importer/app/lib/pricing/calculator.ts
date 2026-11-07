/**
 * Noblenest prijscalculator.
 *
 * Rekent met decimal.js (geen floating-point-fouten). Bedragen worden pas aan het einde
 * op centen afgerond.
 *
 * Model:
 *   kostprijs (landed cost) = inkoop + verzending + invoerkosten + overige kosten   (excl. btw)
 *   netto verkoopprijs     = volgens strategie (opslag of doelmarge), excl. btw
 *   bruto verkoopprijs     = netto × (1 + btw%)
 *   betaal-/platformkosten = percentage van het bedrag dat de klant betaalt (bruto) + vast bedrag
 *   winst                  = netto − kostprijs − betaalkosten − platformkosten
 *   brutomarge             = winst / netto × 100%
 *
 * Wisselkoersen volgen de ECB-notatie: 1 EUR = rate × valuta.
 */
import { Decimal } from "decimal.js";

export type PricingStrategy = "FIXED_MARKUP" | "PERCENTAGE_MARKUP" | "TARGET_MARGIN";
export type PriceRounding = "NONE" | "END_95" | "END_99";
export type Numeric = number | string | Decimal;

export interface PricingRuleInput {
  id?: string;
  name?: string;
  strategy: PricingStrategy;
  /** Opslagbedrag (winkelvaluta), opslagpercentage of doelmarge in % */
  value: Numeric;
  minimumPrice?: Numeric | null;
  rounding: PriceRounding;
  /** Standaard verzendkosten (winkelvaluta) wanneer het product er zelf geen heeft */
  defaultShippingCost?: Numeric | null;
  importDutyPercent?: Numeric | null;
  paymentFeePercent?: Numeric | null;
  paymentFeeFixed?: Numeric | null;
  platformFeePercent?: Numeric | null;
  otherCosts?: Numeric | null;
  /** Btw-percentage voor deze belastingcontext. null = niet ingesteld (wordt gemeld). */
  vatPercent?: Numeric | null;
  pricesIncludeVat: boolean;
}

export interface PricingProductInput {
  costPrice: Numeric | null | undefined;
  currencyCode: string;
  /** Verzendkosten in de valuta van het product */
  shippingCost?: Numeric | null;
}

export interface PricingContext {
  shopCurrency: string;
  /** ECB-notatie: aantal eenheden valuta per 1 EUR. EUR zelf hoeft niet aanwezig te zijn. */
  exchangeRates: Record<string, Numeric>;
}

export type PricingIssueCode =
  | "COST_PRICE_MISSING"
  | "EXCHANGE_RATE_MISSING"
  | "SHIPPING_COST_MISSING"
  | "VAT_NOT_CONFIGURED"
  | "TARGET_MARGIN_UNREACHABLE"
  | "NEGATIVE_MARGIN"
  | "INVALID_RULE";

export interface PricingIssue {
  code: PricingIssueCode;
  severity: "error" | "warning";
  message: string;
}

export interface PriceBreakdown {
  currency: string;
  costPrice: string;
  shippingCost: string;
  importDuty: string;
  otherCosts: string;
  landedCost: string;
  netPrice: string;
  vatAmount: string;
  grossPrice: string;
  /** De prijs die in Shopify wordt gezet (incl. of excl. btw volgens de regel) */
  sellingPrice: string;
  paymentFees: string;
  platformFees: string;
  estimatedProfit: string;
  grossMarginPercent: string;
}

export interface PriceCalculation {
  ok: boolean;
  breakdown: PriceBreakdown | null;
  issues: PricingIssue[];
}

const ZERO = new Decimal(0);
const HUNDRED = new Decimal(100);

function dec(value: Numeric | null | undefined): Decimal | null {
  if (value === null || value === undefined || value === "") return null;
  try {
    const d = new Decimal(value);
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
}

function pct(value: Numeric | null | undefined): Decimal {
  return (dec(value) ?? ZERO).div(HUNDRED);
}

function money(value: Decimal): string {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

/** Zet een bedrag om van `from` naar `to` met ECB-koersen (1 EUR = rate × valuta). */
export function convertCurrency(
  amount: Decimal,
  from: string,
  to: string,
  rates: Record<string, Numeric>,
): Decimal | null {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  if (f === t) return amount;
  const rateFrom = f === "EUR" ? new Decimal(1) : dec(rates[f]);
  const rateTo = t === "EUR" ? new Decimal(1) : dec(rates[t]);
  if (!rateFrom || !rateTo || rateFrom.lte(0) || rateTo.lte(0)) return null;
  return amount.div(rateFrom).mul(rateTo);
}

/** Rondt naar boven af op ,95 of ,99 (nooit onder de berekende prijs). */
export function applyRounding(price: Decimal, rounding: PriceRounding): Decimal {
  if (rounding === "NONE") return price.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const ending = new Decimal(rounding === "END_95" ? "0.95" : "0.99");
  const rounded = price.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  let candidate = rounded.floor().plus(ending);
  if (candidate.lt(rounded)) candidate = candidate.plus(1);
  return candidate;
}

export interface CalculateOptions {
  /**
   * Handmatige verkoopprijs van de winkelier (zoals in Shopify, incl./excl. btw volgens de regel).
   * Kostprijs, btw, transactiekosten, winst en marge worden dan vanaf deze prijs berekend;
   * strategie, minimumprijs en afronding worden niet toegepast.
   */
  fixedSellingPrice?: Numeric | null;
}

export function calculatePrice(
  product: PricingProductInput,
  rule: PricingRuleInput,
  context: PricingContext,
  options: CalculateOptions = {},
): PriceCalculation {
  const issues: PricingIssue[] = [];
  const shopCurrency = context.shopCurrency.toUpperCase();
  const productCurrency = (product.currencyCode || shopCurrency).toUpperCase();

  const ruleValue = dec(rule.value);
  if (!ruleValue || ruleValue.isNegative()) {
    issues.push({ code: "INVALID_RULE", severity: "error", message: "De prijsregel heeft geen geldige waarde." });
  }

  const rawCost = dec(product.costPrice);
  if (!rawCost || rawCost.isNegative()) {
    issues.push({
      code: "COST_PRICE_MISSING",
      severity: "error",
      message: "Inkoopprijs ontbreekt — er kan geen verkoopprijs worden berekend.",
    });
  }

  let cost: Decimal | null = null;
  let shipping: Decimal = ZERO;

  if (rawCost) {
    cost = convertCurrency(rawCost, productCurrency, shopCurrency, context.exchangeRates);
    if (!cost) {
      issues.push({
        code: "EXCHANGE_RATE_MISSING",
        severity: "error",
        message: `Geen wisselkoers beschikbaar voor ${productCurrency} → ${shopCurrency}.`,
      });
    }
  }

  const rawShipping = dec(product.shippingCost);
  if (rawShipping) {
    const converted = convertCurrency(rawShipping, productCurrency, shopCurrency, context.exchangeRates);
    if (converted) {
      shipping = converted;
    } else if (!issues.some((i) => i.code === "EXCHANGE_RATE_MISSING")) {
      issues.push({
        code: "EXCHANGE_RATE_MISSING",
        severity: "error",
        message: `Geen wisselkoers beschikbaar voor ${productCurrency} → ${shopCurrency}.`,
      });
    }
  } else if (dec(rule.defaultShippingCost)) {
    shipping = dec(rule.defaultShippingCost)!;
  } else {
    issues.push({
      code: "SHIPPING_COST_MISSING",
      severity: "warning",
      message: "Verzendkosten onbekend — gerekend met € 0,00.",
    });
  }

  const vatKnown = dec(rule.vatPercent) !== null;
  if (!vatKnown) {
    issues.push({
      code: "VAT_NOT_CONFIGURED",
      severity: "warning",
      message: "Btw-tarief niet ingesteld voor deze prijsregel — gerekend met 0%.",
    });
  }

  if (issues.some((i) => i.severity === "error") || !cost || !ruleValue) {
    return { ok: false, breakdown: null, issues };
  }

  const vat = pct(rule.vatPercent);
  const duty = cost.plus(shipping).mul(pct(rule.importDutyPercent));
  const other = dec(rule.otherCosts) ?? ZERO;
  const landed = cost.plus(shipping).plus(duty).plus(other);

  const paymentPct = pct(rule.paymentFeePercent);
  const paymentFixed = dec(rule.paymentFeeFixed) ?? ZERO;
  const platformPct = pct(rule.platformFeePercent);
  const vatFactor = new Decimal(1).plus(vat);

  const fixed = options.fixedSellingPrice === undefined || options.fixedSellingPrice === null ? null : dec(options.fixedSellingPrice);
  if (options.fixedSellingPrice !== undefined && options.fixedSellingPrice !== null && (!fixed || fixed.lte(0))) {
    issues.push({ code: "INVALID_RULE", severity: "error", message: "De handmatige verkoopprijs is ongeldig." });
    return { ok: false, breakdown: null, issues };
  }

  let net: Decimal;
  if (fixed) {
    net = rule.pricesIncludeVat ? fixed.div(vatFactor) : fixed;
  } else switch (rule.strategy) {
    case "FIXED_MARKUP":
      net = landed.plus(ruleValue);
      break;
    case "PERCENTAGE_MARKUP":
      net = landed.mul(new Decimal(1).plus(ruleValue.div(HUNDRED)));
      break;
    case "TARGET_MARGIN": {
      const margin = ruleValue.div(HUNDRED);
      const denominator = new Decimal(1).minus(margin).minus(vatFactor.mul(paymentPct.plus(platformPct)));
      if (denominator.lte(0)) {
        issues.push({
          code: "TARGET_MARGIN_UNREACHABLE",
          severity: "error",
          message: "De doelmarge is niet haalbaar met deze kosten (marge + transactiekosten ≥ 100%).",
        });
        return { ok: false, breakdown: null, issues };
      }
      net = landed.plus(paymentFixed).div(denominator);
      break;
    }
    default:
      issues.push({ code: "INVALID_RULE", severity: "error", message: "Onbekende prijsstrategie." });
      return { ok: false, breakdown: null, issues };
  }

  // Prijs die in Shopify komt: incl. of excl. btw.
  let shopPrice = rule.pricesIncludeVat ? net.mul(vatFactor) : net;
  if (fixed) {
    shopPrice = fixed.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  } else {
    const minimum = dec(rule.minimumPrice);
    if (minimum && shopPrice.lt(minimum)) shopPrice = minimum;
    shopPrice = applyRounding(shopPrice, rule.rounding);
  }

  // Terugrekenen vanaf de definitieve (afgeronde) prijs.
  const finalNet = rule.pricesIncludeVat ? shopPrice.div(vatFactor) : shopPrice;
  const finalGross = finalNet.mul(vatFactor);
  const vatAmount = finalGross.minus(finalNet);
  const paymentFees = finalGross.mul(paymentPct).plus(paymentFixed);
  const platformFees = finalGross.mul(platformPct);
  const profit = finalNet.minus(landed).minus(paymentFees).minus(platformFees);
  const marginPct = finalNet.isZero() ? ZERO : profit.div(finalNet).mul(HUNDRED);
  if (profit.isNegative()) {
    issues.push({
      code: "NEGATIVE_MARGIN",
      severity: "warning",
      message: `Verlies: de verkoopprijs dekt de kosten niet (${profit.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)} ${shopCurrency} per stuk).`,
    });
  }

  return {
    ok: true,
    issues,
    breakdown: {
      currency: shopCurrency,
      costPrice: money(cost),
      shippingCost: money(shipping),
      importDuty: money(duty),
      otherCosts: money(other),
      landedCost: money(landed),
      netPrice: money(finalNet),
      vatAmount: money(vatAmount),
      grossPrice: money(finalGross),
      sellingPrice: money(shopPrice),
      paymentFees: money(paymentFees),
      platformFees: money(platformFees),
      estimatedProfit: money(profit),
      grossMarginPercent: marginPct.toDecimalPlaces(1, Decimal.ROUND_HALF_UP).toFixed(1),
    },
  };
}

export interface RuleCandidate extends PricingRuleInput {
  id: string;
  isActive: boolean;
  priority: number;
  scope: "GLOBAL" | "CATEGORY" | "SUPPLIER";
  category?: string | null;
  supplierId?: string | null;
}

const SCOPE_SPECIFICITY: Record<RuleCandidate["scope"], number> = { SUPPLIER: 0, CATEGORY: 1, GLOBAL: 2 };

/**
 * Kiest de prijsregel voor een product: alleen actieve regels die van toepassing zijn;
 * laagste prioriteit wint, bij gelijke prioriteit de meest specifieke (leverancier > categorie > globaal).
 */
export function selectPricingRule<T extends RuleCandidate>(
  rules: T[],
  product: { productType?: string | null; supplierId?: string | null },
): T | null {
  const productType = product.productType?.trim().toLowerCase() || null;
  const applicable = rules.filter((rule) => {
    if (!rule.isActive) return false;
    if (rule.scope === "GLOBAL") return true;
    if (rule.scope === "CATEGORY") {
      return !!productType && rule.category?.trim().toLowerCase() === productType;
    }
    return !!product.supplierId && rule.supplierId === product.supplierId;
  });
  applicable.sort(
    (a, b) => a.priority - b.priority || SCOPE_SPECIFICITY[a.scope] - SCOPE_SPECIFICITY[b.scope],
  );
  return applicable[0] ?? null;
}
