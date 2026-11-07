import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseProductCsv } from "../../app/lib/import/csv";
import { buildProductSetInput, ProductSetBuildError } from "../../app/lib/shopify/product-set";
import type { NormalizedProduct } from "../../app/lib/import/types";

const sample = readFileSync(new URL("../../public/voorbeeld/noblenest-voorbeeldcatalogus.csv", import.meta.url), "utf8");
const products = new Map(
  parseProductCsv(sample, { supplierKey: "csv" }).products.map((p) => [p.externalId, p] as const),
);

function pricingFor(p: NormalizedProduct, price = "29.95") {
  return new Map(p.variants.map((v) => [v.externalId, { price, unitCost: "12.00" }]));
}

describe("buildProductSetInput", () => {
  it("maakt altijd een concept (DRAFT) met de bron-ID als app-metafield", () => {
    const p = products.get("NN-1001")!;
    const input = buildProductSetInput(p, { sourceKey: "csv:NN-1001", pricing: pricingFor(p), merchantConfirmedImageRights: false });
    expect(input.status).toBe("DRAFT");
    expect(input.metafields).toEqual([{ namespace: "$app", key: "source_id", type: "id", value: "csv:NN-1001" }]);
    expect(input).not.toHaveProperty("id");
  });

  it("zet opties en varianten correct om, inclusief prijs, kostprijs, gewicht en herkomst", () => {
    const p = products.get("NN-1001")!;
    const input = buildProductSetInput(p, { sourceKey: "csv:NN-1001", pricing: pricingFor(p), merchantConfirmedImageRights: false });
    expect(input.productOptions).toEqual([
      { name: "Maat", position: 1, values: [{ name: "140 x 200 cm" }, { name: "200 x 220 cm" }, { name: "240 x 220 cm" }] },
    ]);
    expect(input.variants).toHaveLength(3);
    expect(input.variants[0]).toMatchObject({
      optionValues: [{ optionName: "Maat", name: "140 x 200 cm" }],
      price: "29.95",
      sku: "NN-1001-140",
      inventoryPolicy: "DENY",
      inventoryItem: { cost: "12.00", tracked: false, countryCodeOfOrigin: "PT", measurement: { weight: { value: 1450, unit: "GRAMS" } } },
    });
    expect(input.files).toHaveLength(2);
  });

  it("gebruikt de standaardoptie voor een product zonder varianten", () => {
    const p = products.get("NN-1005")!;
    const input = buildProductSetInput(p, { sourceKey: "csv:NN-1005", pricing: pricingFor(p), merchantConfirmedImageRights: false });
    expect(input.productOptions).toEqual([{ name: "Title", position: 1, values: [{ name: "Default Title" }] }]);
    expect(input.variants[0]!.optionValues).toEqual([{ optionName: "Title", name: "Default Title" }]);
  });

  it("zet alle foto's in volgorde in files en laat varianten naar dezelfde bron verwijzen", () => {
    const p = products.get("NN-1002")!;
    const input = buildProductSetInput(p, { sourceKey: "csv:NN-1002", pricing: pricingFor(p), merchantConfirmedImageRights: false });
    expect(input.variants.map((v) => v.file?.originalSource)).toEqual([
      "https://picsum.photos/id/1068/1200/1200",
      "https://picsum.photos/id/1069/1200/1200",
      "https://picsum.photos/id/1070/1200/1200",
    ]);
    // Zelfde bron in files + variant → Shopify maakt geen dubbele media (productSet-documentatie)
    expect(input.files!.map((f) => f.originalSource)).toEqual([
      "https://picsum.photos/id/1067/1200/1200",
      "https://picsum.photos/id/1068/1200/1200",
      "https://picsum.photos/id/1069/1200/1200",
      "https://picsum.photos/id/1070/1200/1200",
    ]);
  });

  it("past bewerkingen van de winkelier toe: teksten, type, merk, tags, collecties", () => {
    const p = products.get("NN-1005")!;
    const input = buildProductSetInput(p, {
      sourceKey: "csv:NN-1005",
      pricing: pricingFor(p),
      merchantConfirmedImageRights: false,
      extraTags: ["noblenest"],
      overrides: {
        title: "Carrara dienblad in wit marmer",
        productType: "Serveren",
        vendor: "Noblenest",
        tags: ["Marmer"],
        collections: ["gid://shopify/Collection/11", "gid://shopify/Collection/11", "fout"],
      },
    });
    expect(input).toMatchObject({ title: "Carrara dienblad in wit marmer", productType: "Serveren", vendor: "Noblenest", tags: ["Marmer", "noblenest"] });
    expect(input.collections).toEqual(["gid://shopify/Collection/11"]);
    expect(input.status).toBe("DRAFT");
  });

  it("volgt de gekozen fotovolgorde (hoofdfoto eerst), sluit foto's uit en respecteert beeldrechten", () => {
    const p = products.get("NN-1002")!;
    const input = buildProductSetInput(p, {
      sourceKey: "csv:NN-1002",
      pricing: pricingFor(p),
      merchantConfirmedImageRights: false,
      overrides: {
        images: ["https://picsum.photos/id/1069/1200/1200", "https://picsum.photos/id/1067/1200/1200", "https://niet-van-dit-product.nl/x.jpg"],
        variantImages: { "NN-1002-SAL": null, "NN-1002-OKR": "https://picsum.photos/id/1067/1200/1200" },
      },
    });
    expect(input.files!.map((f) => f.originalSource)).toEqual(["https://picsum.photos/id/1069/1200/1200", "https://picsum.photos/id/1067/1200/1200"]);
    // SAL: bewust geen foto; OKR: andere foto; ANT: oorspronkelijke foto is uitgesloten → geen foto
    expect(input.variants.map((v) => v.file?.originalSource ?? null)).toEqual([null, "https://picsum.photos/id/1067/1200/1200", null]);

    const lamp = products.get("NN-1004")!; // beeldrechten niet bevestigd
    const noRights = buildProductSetInput(lamp, { sourceKey: "x", pricing: pricingFor(lamp), merchantConfirmedImageRights: false, overrides: { images: [lamp.images[0]!.url] } });
    expect(noRights.files).toBeUndefined();
  });

  it("stuurt geen afbeeldingen mee zonder bevestigde beeldrechten", () => {
    const p = products.get("NN-1004")!;
    const without = buildProductSetInput(p, { sourceKey: "csv:NN-1004", pricing: pricingFor(p), merchantConfirmedImageRights: false });
    expect(without.files).toBeUndefined();
    const withConsent = buildProductSetInput(p, { sourceKey: "csv:NN-1004", pricing: pricingFor(p), merchantConfirmedImageRights: true });
    expect(withConsent.files).toHaveLength(1);
  });

  it("weigert ontbrekende of ongeldige prijzen", () => {
    const p = products.get("NN-1005")!;
    expect(() => buildProductSetInput(p, { sourceKey: "x", pricing: new Map(), merchantConfirmedImageRights: false })).toThrow(
      ProductSetBuildError,
    );
    expect(() =>
      buildProductSetInput(p, { sourceKey: "x", pricing: pricingFor(p, "12,50"), merchantConfirmedImageRights: false }),
    ).toThrow(/Ongeldige verkoopprijs/);
  });

  it("gebruikt AI-teksten alleen als ze bestaan en laat de bron intact", () => {
    const p = products.get("NN-1005")!;
    const input = buildProductSetInput(p, {
      sourceKey: "csv:NN-1005",
      pricing: pricingFor(p),
      merchantConfirmedImageRights: false,
      overrides: { title: "  ", seoTitle: "Marmeren dienblad | Noblenest" },
    });
    expect(input.title).toBe("Marmeren dienblad Carrara");
    expect(input.seo).toEqual({ title: "Marmeren dienblad | Noblenest" });
    expect(p.title).toBe("Marmeren dienblad Carrara");
  });
});
