import { describe, expect, it } from "vitest";
import { classifyMarketplace, feedFormatFromUrl } from "../../app/lib/import/url-sources";
import { manualExternalId, parseManualProduct } from "../../app/lib/import/manual";

describe("productlinks herkennen", () => {
  it("herkent marktplaatsen", () => {
    expect(classifyMarketplace("www.aliexpress.com")?.supplierKey).toBe("aliexpress");
    expect(classifyMarketplace("nl.aliexpress.com")?.supplierKey).toBe("aliexpress");
    expect(classifyMarketplace("detail.1688.com")?.supplierKey).toBe("alibaba");
    expect(classifyMarketplace("www.alibaba.com")?.supplierKey).toBe("alibaba");
    expect(classifyMarketplace("www.temu.com")?.supplierKey).toBe("temu");
    expect(classifyMarketplace("aliexpress.com.voorbeeld.nl")).toBeNull();
    expect(classifyMarketplace("leverancier.nl")).toBeNull();
  });

  it("herkent links naar feedbestanden", () => {
    expect(feedFormatFromUrl(new URL("https://lev.nl/export/feed.XML?token=1"))).toBe("XML");
    expect(feedFormatFromUrl(new URL("https://lev.nl/feed.json"))).toBe("JSON");
    expect(feedFormatFromUrl(new URL("https://lev.nl/producten/lamp"))).toBeNull();
  });
});

describe("handmatige invoer", () => {
  it("maakt een product met varianten en door de winkelier bevestigde beeldrechten", () => {
    const r = parseManualProduct(
      {
        title: "Linnen tafelkleed",
        costPrice: "18,50",
        sku: "TK-01",
        optionName: "Maat",
        optionValues: "140 x 200, 140 x 250",
        stockQuantity: "4",
        imageUrls: "https://cdn.lev.nl/a.jpg\nhttps://cdn.lev.nl/b.jpg",
        imageRightsConfirmed: true,
        deliveryDaysMin: "2",
        deliveryDaysMax: "4",
      },
      "EUR",
    );
    expect(r.errors).toEqual([]);
    const p = r.products[0]!;
    expect(p).toMatchObject({ externalId: "handmatig-tk-01", supplierKey: "manual", currencyCode: "EUR", deliveryDaysMin: 2 });
    expect(p.options).toEqual([{ name: "Maat", values: ["140 x 200", "140 x 250"] }]);
    expect(p.variants.map((v) => [v.sku, v.costPrice, v.stockQuantity])).toEqual([
      ["TK-01-140-x-200", "18.5", 4],
      ["TK-01-140-x-250", "18.5", 4],
    ]);
    expect(p.images.map((i) => [i.url, i.rights])).toEqual([
      ["https://cdn.lev.nl/a.jpg", "CONFIRMED_BY_MERCHANT"],
      ["https://cdn.lev.nl/b.jpg", "CONFIRMED_BY_MERCHANT"],
    ]);
  });

  it("meldt ongeldige invoer en genereert unieke ID's zonder SKU", () => {
    const r = parseManualProduct({ title: "Vaas", costPrice: "gratis", imageRightsConfirmed: false }, "EUR");
    expect(r.products).toEqual([]);
    expect(r.errors[0]!.message).toMatch(/inkoopprijs/);
    expect(manualExternalId(undefined)).not.toBe(manualExternalId(undefined));
    expect(manualExternalId(" Vaas/Groot ")).toBe("handmatig-vaas-groot");
  });
});
