import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseGoogleXmlFeed, parsePrice, parseWeight } from "../../app/lib/import/feeds/google-xml";
import { parseJsonFeed } from "../../app/lib/import/feeds/json-feed";
import { detectFormat, parseSource } from "../../app/lib/import/sources";
import { checkProduct } from "../../app/lib/import/compliance";
import { sourceKeyFor } from "../../app/lib/import/types";

const read = (name: string) => readFileSync(new URL(`../../public/voorbeeld/${name}`, import.meta.url), "utf8");

describe("XML-feed (Google Merchant Center)", () => {
  const result = parseGoogleXmlFeed(read("noblenest-voorbeeldfeed.xml"), { supplierKey: "xml-feed" });
  const byId = new Map(result.products.map((p) => [p.externalId, p]));

  it("leest de voorbeeldfeed zonder fouten", () => {
    expect(result.errors).toEqual([]);
    expect(result.products.map((p) => p.externalId)).toEqual(["NF-2001", "NF-2002"]);
    expect(result.totalRows).toBe(3);
  });

  it("groepeert varianten via item_group_id met afgeleide optie", () => {
    const plaid = byId.get("NF-2001")!;
    expect(plaid.options).toEqual([{ name: "Kleur", values: ["Antraciet", "Zand"] }]);
    expect(plaid.variants.map((v) => [v.externalId, v.costPrice, v.stockStatus, v.barcode, v.weightGrams])).toEqual([
      ["NF-2001-ZW", "34.9", "IN_STOCK", "8712345000011", 900],
      ["NF-2001-ZA", "34.9", "OUT_OF_STOCK", "8712345000028", 900],
    ]);
    expect(plaid.productType).toBe("Plaids");
    expect(plaid.brand).toBe("Noblenest Testcollectie");
    expect(plaid.shippingCost).toBe("4.95");
    // levertijd = verwerking (1–2) + transport (1–2)
    expect([plaid.deliveryDaysMin, plaid.deliveryDaysMax]).toEqual([2, 4]);
    expect(plaid.images.map((i) => i.url)).toEqual([
      "https://picsum.photos/id/1056/1200/1200",
      "https://picsum.photos/id/1057/1200/1200",
      "https://picsum.photos/id/1058/1200/1200",
    ]);
    expect(plaid.variants[1]!.imageUrl).toBe("https://picsum.photos/id/1058/1200/1200");
    // Feeds hebben standaard geen bevestigde beeldrechten
    expect(plaid.images.every((i) => i.rights === "UNVERIFIED")).toBe(true);
  });

  it("gebruikt cost_of_goods_sold als inkoopprijs en houdt preorder op 'onbekend'", () => {
    const karaf = byId.get("NF-2002")!;
    expect(karaf.currencyCode).toBe("USD");
    expect(karaf.variants[0]!.costPrice).toBe("18.4");
    expect(karaf.stockStatus).toBe("UNKNOWN");
    expect(karaf.variants[0]!.weightGrams).toBe(650);
    expect(karaf.options).toEqual([]);
  });

  it("bronlabel en beeldrechten van de leverancier", () => {
    const r = parseGoogleXmlFeed(read("noblenest-voorbeeldfeed.xml"), { supplierKey: "xml-feed", idPrefix: "linnenhuis", imageRightsFromSupplier: true });
    expect(r.products[0]!.externalId).toBe("linnenhuis:NF-2001");
    expect(sourceKeyFor("xml-feed", r.products[0]!.externalId)).toBe("xml-feed:linnenhuis:NF-2001");
    expect(r.products[0]!.images.every((i) => i.rights === "CONFIRMED_BY_SUPPLIER")).toBe(true);
  });

  it("weigert DOCTYPE/ENTITY (XXE en entity-expansie)", () => {
    const evil = `<?xml version="1.0"?><!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss><channel><item><g:id>&x;</g:id></item></channel></rss>`;
    const r = parseGoogleXmlFeed(evil, { supplierKey: "xml-feed" });
    expect(r.products).toEqual([]);
    expect(r.errors[0]!.message).toMatch(/DOCTYPE/);
  });

  it("meldt een onbekend XML-formaat en ongeldige XML", () => {
    expect(parseGoogleXmlFeed("<catalogus><product/></catalogus>", { supplierKey: "xml-feed" }).errors[0]!.message).toMatch(/Geen productfeed/);
    expect(parseGoogleXmlFeed("<rss><channel><item>", { supplierKey: "xml-feed" }).errors[0]!.message).toMatch(/Ongeldige XML|Geen productfeed/);
  });

  it("ondersteunt Atom en een afwijkend namespace-prefix", () => {
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:gm="http://base.google.com/ns/1.0">
      <entry><gm:id>A1</gm:id><title>Kandelaar</title><link href="https://lev.nl/a1"/><gm:price>12,50 EUR</gm:price></entry></feed>`;
    const r = parseGoogleXmlFeed(atom, { supplierKey: "xml-feed" });
    expect(r.errors).toEqual([]);
    expect(r.products[0]).toMatchObject({ externalId: "A1", title: "Kandelaar", sourceUrl: "https://lev.nl/a1", currencyCode: "EUR" });
    expect(r.products[0]!.variants[0]!.costPrice).toBe("12.5");
  });

  it("hulpfuncties voor prijs en gewicht", () => {
    expect(parsePrice("12.99 EUR")).toEqual({ amount: "12.99", currency: "EUR" });
    expect(parsePrice("USD 8")).toEqual({ amount: "8", currency: "USD" });
    expect(parsePrice("12.99")).toBeNull();
    expect(parseWeight("1,5 kg")).toBe("1500");
    expect(parseWeight("2 lb")).toBe("907");
    expect(parseWeight("zwaar")).toBeUndefined();
  });
});

describe("JSON-feed", () => {
  const result = parseJsonFeed(read("noblenest-voorbeeldfeed.json"), { supplierKey: "json-feed" });
  const byId = new Map(result.products.map((p) => [p.externalId, p]));

  it("leest producten met varianten en Nederlandse veldnamen", () => {
    expect(result.errors).toEqual([]);
    const servetten = byId.get("NJ-3001")!;
    expect(servetten.options).toEqual([{ name: "Kleur", values: ["Saffier", "Salie"] }]);
    expect(servetten.variants.map((v) => [v.sku, v.costPrice, v.stockStatus])).toEqual([
      ["NJ-3001-SAF", "14.5", "IN_STOCK"],
      ["NJ-3001-SAL", "15", "OUT_OF_STOCK"],
    ]);
    expect(servetten.tags).toEqual(["Tafel", "Linnen"]);
    expect(servetten.images[0]!.rights).toBe("CONFIRMED_BY_SUPPLIER");
    expect(checkProduct(servetten).filter((f) => f.severity !== "info")).toEqual([]);

    const plank = byId.get("NJ-3002")!;
    expect(plank).toMatchObject({ title: "Eikenhouten snijplank Rustiek", deliveryDaysMin: 3, deliveryDaysMax: 5 });
    expect(plank.variants[0]).toMatchObject({ costPrice: "19.9", stockQuantity: 8 });
  });

  it("accepteert een lijst op het hoogste niveau en meldt fouten per product", () => {
    const r = parseJsonFeed(JSON.stringify([{ external_id: "X1", title: "Goed", cost_price: 5 }, 42, { title: "Zonder id" }]), { supplierKey: "json-feed" });
    expect(r.products.map((p) => p.externalId)).toEqual(["X1"]);
    expect(r.errors.map((e) => e.message)).toEqual(["Product 2 is geen object.", "external_id ontbreekt — regel overgeslagen."]);
  });

  it("meldt ongeldige JSON en een onbekende structuur", () => {
    expect(parseJsonFeed("{kapot", { supplierKey: "json-feed" }).errors[0]!.message).toMatch(/Ongeldige JSON/);
    expect(parseJsonFeed('{"items": []}', { supplierKey: "json-feed" }).errors[0]!.message).toMatch(/Geen producten/);
  });
});

describe("formaatherkenning", () => {
  it("herkent het formaat aan extensie of inhoud", () => {
    expect(detectFormat("feed.XML", "")).toBe("XML");
    expect(detectFormat("export.csv", "<x>")).toBe("CSV");
    expect(detectFormat("data", ' {"products": []}')).toBe("JSON");
    expect(detectFormat("data", "<rss>")).toBe("XML");
    expect(detectFormat("data", "id,title")).toBeNull();
    expect(parseSource("JSON", '{"products":[{"external_id":"A","title":"B","cost_price":1}]}', { supplierKey: "json-feed" }).products).toHaveLength(1);
  });

  it("leest bestanden met een BOM-teken (Excel/Windows)", () => {
    const bom = String.fromCharCode(0xfeff);
    expect(parseSource("CSV", `${bom}external_id,title,cost_price\nA,Lamp,1`, { supplierKey: "csv" }).products).toHaveLength(1);
    expect(parseSource("JSON", `${bom}[{"external_id":"A","title":"Lamp","cost_price":1}]`, { supplierKey: "json-feed" }).products).toHaveLength(1);
    expect(detectFormat("upload", `${bom}<rss>`)).toBe("XML");
  });

  it("weigert een ongeldig bronlabel", () => {
    const r = parseSource("JSON", '[{"external_id":"A","title":"B"}]', { supplierKey: "json-feed", idPrefix: "Fout Label!" });
    expect(r.errors[0]!.message).toMatch(/Bronlabel/);
  });
});
