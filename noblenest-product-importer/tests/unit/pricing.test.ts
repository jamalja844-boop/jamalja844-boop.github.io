import { describe, expect, it } from "vitest";
import { Decimal } from "decimal.js";
import {
  applyRounding,
  calculatePrice,
  convertCurrency,
  selectPricingRule,
  type PricingRuleInput,
  type RuleCandidate,
} from "../../app/lib/pricing/calculator";

const eur = { shopCurrency: "EUR", exchangeRates: { USD: "1.0800", CNY: "7.8000" } };

const baseRule: PricingRuleInput = {
  strategy: "PERCENTAGE_MARKUP",
  value: 100,
  rounding: "NONE",
  vatPercent: 21,
  pricesIncludeVat: true,
};

describe("calculatePrice — percentage opslag", () => {
  it("berekent kostprijs, netto/brutoprijs, winst en marge exact", () => {
    const result = calculatePrice({ costPrice: "10.00", currencyCode: "EUR", shippingCost: "2.00" }, baseRule, eur);
    expect(result.ok).toBe(true);
    const b = result.breakdown!;
    expect(b.landedCost).toBe("12.00");
    expect(b.netPrice).toBe("24.00"); // 12 × 2
    expect(b.sellingPrice).toBe("29.04"); // 24 × 1,21
    expect(b.vatAmount).toBe("5.04");
    expect(b.estimatedProfit).toBe("12.00");
    expect(b.grossMarginPercent).toBe("50.0");
    expect(result.issues).toEqual([]);
  });

  it("rekent prijzen excl. btw wanneer de regel dat aangeeft", () => {
    const result = calculatePrice(
      { costPrice: 10, currencyCode: "EUR", shippingCost: 0 },
      { ...baseRule, pricesIncludeVat: false },
      eur,
    );
    expect(result.breakdown!.sellingPrice).toBe("20.00");
    expect(result.breakdown!.grossPrice).toBe("24.20");
  });
});

describe("calculatePrice — vaste opslag en kosten", () => {
  it("telt invoerkosten, overige kosten en transactiekosten mee", () => {
    const rule: PricingRuleInput = {
      strategy: "FIXED_MARKUP",
      value: "15",
      rounding: "NONE",
      importDutyPercent: 10, // over inkoop + verzending
      otherCosts: "1.50",
      paymentFeePercent: "2.9",
      paymentFeeFixed: "0.25",
      platformFeePercent: 0,
      vatPercent: 21,
      pricesIncludeVat: true,
    };
    const result = calculatePrice({ costPrice: "20", currencyCode: "EUR", shippingCost: "5" }, rule, eur);
    const b = result.breakdown!;
    expect(b.importDuty).toBe("2.50");
    expect(b.landedCost).toBe("29.00"); // 20 + 5 + 2,50 + 1,50
    expect(b.netPrice).toBe("44.00");
    expect(b.sellingPrice).toBe("53.24");
    // betaalkosten = 53,24 × 2,9% + 0,25 = 1,79396 → 1,79
    expect(b.paymentFees).toBe("1.79");
    // winst = 44 − 29 − 1,79396 = 13,20604 → 13,21
    expect(b.estimatedProfit).toBe("13.21");
  });
});

describe("calculatePrice — doelmarge", () => {
  it("haalt de doelmarge exact na transactiekosten", () => {
    const rule: PricingRuleInput = {
      strategy: "TARGET_MARGIN",
      value: 40,
      rounding: "NONE",
      paymentFeePercent: 2,
      paymentFeeFixed: 0,
      platformFeePercent: 1,
      vatPercent: 21,
      pricesIncludeVat: true,
      defaultShippingCost: 0,
    };
    const result = calculatePrice({ costPrice: "30", currencyCode: "EUR" }, rule, eur);
    expect(result.ok).toBe(true);
    // netto = 30 / (1 − 0,40 − 1,21 × 0,03) = 30 / 0,5637
    expect(result.breakdown!.netPrice).toBe(new Decimal(30).div("0.5637").toFixed(2));
    expect(Number(result.breakdown!.grossMarginPercent)).toBeCloseTo(40, 1);
  });

  it("meldt een onhaalbare doelmarge", () => {
    const result = calculatePrice(
      { costPrice: 10, currencyCode: "EUR", shippingCost: 0 },
      { ...baseRule, strategy: "TARGET_MARGIN", value: 99, paymentFeePercent: 5 },
      eur,
    );
    expect(result.ok).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain("TARGET_MARGIN_UNREACHABLE");
  });
});

describe("calculatePrice — valuta", () => {
  it("rekent USD om met de ECB-koers", () => {
    const result = calculatePrice({ costPrice: "10.80", currencyCode: "USD", shippingCost: "1.08" }, baseRule, eur);
    expect(result.breakdown!.costPrice).toBe("10.00");
    expect(result.breakdown!.shippingCost).toBe("1.00");
  });

  it("geeft een fout als de wisselkoers ontbreekt", () => {
    const result = calculatePrice({ costPrice: 5, currencyCode: "GBP", shippingCost: 1 }, baseRule, eur);
    expect(result.ok).toBe(false);
    expect(result.issues.filter((i) => i.code === "EXCHANGE_RATE_MISSING")).toHaveLength(1);
  });

  it("convertCurrency werkt tussen twee niet-EUR-valuta's", () => {
    expect(convertCurrency(new Decimal("7.80"), "CNY", "USD", eur.exchangeRates)!.toFixed(2)).toBe("1.08");
  });
});

describe("calculatePrice — ontbrekende gegevens", () => {
  it("weigert zonder inkoopprijs", () => {
    const result = calculatePrice({ costPrice: null, currencyCode: "EUR" }, baseRule, eur);
    expect(result.ok).toBe(false);
    expect(result.issues[0]!.code).toBe("COST_PRICE_MISSING");
  });

  it("waarschuwt bij onbekende verzendkosten en ontbrekend btw-tarief", () => {
    const result = calculatePrice({ costPrice: 10, currencyCode: "EUR" }, { ...baseRule, vatPercent: null }, eur);
    expect(result.ok).toBe(true);
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain("SHIPPING_COST_MISSING");
    expect(codes).toContain("VAT_NOT_CONFIGURED");
    expect(result.breakdown!.sellingPrice).toBe("20.00");
  });

  it("gebruikt standaard verzendkosten uit de regel", () => {
    const result = calculatePrice({ costPrice: 10, currencyCode: "EUR" }, { ...baseRule, defaultShippingCost: 4 }, eur);
    expect(result.breakdown!.landedCost).toBe("14.00");
    expect(result.issues.map((i) => i.code)).not.toContain("SHIPPING_COST_MISSING");
  });
});

describe("minimumprijs en afronding", () => {
  it("past de minimumverkoopprijs toe", () => {
    const result = calculatePrice(
      { costPrice: 1, currencyCode: "EUR", shippingCost: 0 },
      { ...baseRule, minimumPrice: "9.95" },
      eur,
    );
    expect(result.breakdown!.sellingPrice).toBe("9.95");
  });

  it("rondt af op ,95 en ,99 — altijd naar boven", () => {
    expect(applyRounding(new Decimal("12.30"), "END_95").toFixed(2)).toBe("12.95");
    expect(applyRounding(new Decimal("12.95"), "END_95").toFixed(2)).toBe("12.95");
    expect(applyRounding(new Decimal("12.96"), "END_95").toFixed(2)).toBe("13.95");
    expect(applyRounding(new Decimal("12.00"), "END_99").toFixed(2)).toBe("12.99");
    expect(applyRounding(new Decimal("12.994"), "END_99").toFixed(2)).toBe("12.99");
    expect(applyRounding(new Decimal("12.345"), "NONE").toFixed(2)).toBe("12.35");
  });

  it("herberekent winst en marge vanaf de afgeronde prijs", () => {
    const result = calculatePrice(
      { costPrice: 10, currencyCode: "EUR", shippingCost: 0 },
      { ...baseRule, rounding: "END_99" },
      eur,
    );
    const b = result.breakdown!;
    expect(b.sellingPrice).toBe("24.99"); // 24,20 → 24,99
    expect(b.netPrice).toBe("20.65"); // 24,99 / 1,21 = 20,6528…
    expect(b.estimatedProfit).toBe("10.65");
  });
});

describe("selectPricingRule", () => {
  const rule = (over: Partial<RuleCandidate>): RuleCandidate => ({
    ...baseRule,
    id: Math.random().toString(36),
    isActive: true,
    priority: 100,
    scope: "GLOBAL",
    ...over,
  });

  it("kiest de laagste prioriteit en daarna de meest specifieke regel", () => {
    const global = rule({ id: "global" });
    const category = rule({ id: "category", scope: "CATEGORY", category: "Lampen" });
    const supplier = rule({ id: "supplier", scope: "SUPPLIER", supplierId: "s1" });
    expect(selectPricingRule([global, category, supplier], { productType: "lampen", supplierId: "s1" })!.id).toBe(
      "supplier",
    );
    expect(selectPricingRule([global, category], { productType: "Lampen" })!.id).toBe("category");
    expect(selectPricingRule([global, category], { productType: "Kussens" })!.id).toBe("global");
    const urgent = rule({ id: "urgent", priority: 1 });
    expect(selectPricingRule([supplier, urgent], { supplierId: "s1" })!.id).toBe("urgent");
  });

  it("negeert inactieve regels en geeft null zonder geschikte regel", () => {
    expect(selectPricingRule([rule({ isActive: false })], {})).toBeNull();
  });
});
