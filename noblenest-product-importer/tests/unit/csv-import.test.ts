import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseProductCsv } from "../../app/lib/import/csv";
import { checkProduct, hasBlockingFlag } from "../../app/lib/import/compliance";
import { detectDuplicates } from "../../app/lib/import/duplicates";
import { sanitizeDescription } from "../../app/lib/import/html";
import { parseDecimal, parsePublicHttpsUrl, ValueError } from "../../app/lib/import/values";

const sample = readFileSync(new URL("../../public/voorbeeld/noblenest-voorbeeldcatalogus.csv", import.meta.url), "utf8");
const parse = (csv: string) => parseProductCsv(csv, { supplierKey: "csv" });

describe("voorbeeldcatalogus", () => {
  const result = parse(sample);
  const byId = new Map(result.products.map((p) => [p.externalId, p]));

  it("leest alle 6 producten zonder fouten", () => {
    expect(result.errors).toEqual([]);
    expect(result.products).toHaveLength(6);
    expect(result.totalRows).toBe(10);
  });

  it("groepeert varianten met opties, prijzen en voorraad", () => {
    const p = byId.get("NN-1001")!;
    expect(p.options).toEqual([{ name: "Maat", values: ["140 x 200 cm", "200 x 220 cm", "240 x 220 cm"] }]);
    expect(p.variants.map((v) => [v.sku, v.costPrice, v.stockQuantity, v.stockStatus])).toEqual([
      ["NN-1001-140", "32.5", 12, "IN_STOCK"],
      ["NN-1001-200", "41", 8, "IN_STOCK"],
      ["NN-1001-240", "46", 0, "OUT_OF_STOCK"],
    ]);
    expect(p.stockStatus).toBe("IN_STOCK");
    expect(p.descriptionHtml).toBe(
      "<p>Zacht gewassen linnen van Europees vlas. Ademend en temperatuurregulerend.</p><p>Inclusief twee kussenslopen.</p>",
    );
    expect(p.images).toHaveLength(2);
    expect(p.images.every((i) => i.rights === "CONFIRMED_BY_SUPPLIER")).toBe(true);
    expect(p.raw).toHaveLength(3);
  });

  it("leest Nederlandse decimalen en voorraadstatus en verwijdert scripts", () => {
    const p = byId.get("NN-1002")!;
    expect(p.variants[0]!.costPrice).toBe("9.8");
    expect(p.shippingCost).toBe("3.5");
    expect(p.variants.map((v) => v.stockStatus)).toEqual(["IN_STOCK", "IN_STOCK", "OUT_OF_STOCK"]);
    expect(p.descriptionHtml).not.toContain("script");
    expect(p.descriptionHtml).toContain("<strong>Inclusief binnenkussen.</strong>");
    // hoofdfoto + 3 variantfoto's
    expect(p.images).toHaveLength(4);
    expect(p.variants[1]!.imageUrl).toBe("https://picsum.photos/id/1069/1200/1200");
  });

  it("markeert een product zonder afbeelding", () => {
    const flags = checkProduct(byId.get("NN-1003")!);
    expect(flags.map((f) => f.code)).toContain("NO_IMAGES");
    expect(hasBlockingFlag(flags)).toBe(false);
  });

  it("markeert onbekende voorraad, onbevestigde beeldrechten en ontbrekende EU-verantwoordelijke", () => {
    const p = byId.get("NN-1004")!;
    expect(p.currencyCode).toBe("USD");
    expect(p.stockStatus).toBe("UNKNOWN");
    const codes = checkProduct(p).map((f) => f.code);
    expect(codes).toEqual(expect.arrayContaining(["STOCK_UNKNOWN", "IMAGE_RIGHTS_UNVERIFIED", "NO_EU_RESPONSIBLE_PERSON"]));
  });

  it("blokkeert een product zonder inkoopprijs", () => {
    const flags = checkProduct(byId.get("NN-1006")!);
    expect(flags.find((f) => f.code === "NO_COST_PRICE")?.severity).toBe("error");
    expect(hasBlockingFlag(flags)).toBe(true);
  });

  it("enkelvoudig product zonder opties krijgt één variant", () => {
    const p = byId.get("NN-1005")!;
    expect(p.options).toEqual([]);
    expect(p.variants).toHaveLength(1);
    expect(p.variants[0]!.costPrice).toBe("24.9");
  });
});

describe("CSV-validatie", () => {
  it("weigert een bestand zonder verplichte kolommen", () => {
    const r = parse("naam,prijs\nLamp,10");
    expect(r.products).toHaveLength(0);
    expect(r.errors[0]!.message).toMatch(/Verplichte kolommen/);
  });

  it("herkent puntkomma als scheidingsteken en Nederlandse kolomnamen", () => {
    const r = parse("externe_id;titel;inkoopprijs;valuta\nA1;Kussen;12,50;eur");
    expect(r.errors).toEqual([]);
    expect(r.products[0]!.variants[0]!.costPrice).toBe("12.5");
    expect(r.products[0]!.currencyCode).toBe("EUR");
  });

  it("meldt fouten per regel en slaat alleen het foute product over", () => {
    const csv = [
      "external_id,title,cost_price,image_urls,option1_name,option1_value",
      "A1,Goed product,10,,,",
      ",Zonder id,10,,,",
      "B1,Fout bedrag,tien,,,",
      "C1,Interne afbeelding,10,http://localhost/x.png,,",
      "D1,Varianten,10,,Kleur,Rood",
      "D1,,10,,Kleur,rood",
    ].join("\n");
    const r = parse(csv);
    expect(r.products.map((p) => p.externalId)).toEqual(["A1"]);
    const messages = r.errors.map((e) => `${e.row}: ${e.message}`);
    expect(messages).toEqual([
      "3: external_id ontbreekt — regel overgeslagen.",
      '4: [B1] inkoopprijs: "tien" is geen geldig getal',
      "5: [C1] afbeelding: alleen https-adressen zijn toegestaan",
      '7: [D1] dubbele variant "rood"',
    ]);
  });

  it("vereist opties wanneer een product meerdere regels heeft", () => {
    const r = parse("external_id,title,cost_price\nA1,Lamp,10\nA1,,12");
    expect(r.products).toHaveLength(0);
    expect(r.errors[0]!.message).toMatch(/geen opties/);
  });

  it("respecteert het maximum aantal regels", () => {
    const rows = Array.from({ length: 6 }, (_, i) => `X${i},Product ${i},1`).join("\n");
    const r = parseProductCsv(`external_id,title,cost_price\n${rows}`, { supplierKey: "csv", maxRows: 5 });
    expect(r.products).toHaveLength(0);
    expect(r.errors[0]!.message).toMatch(/maximaal 5/);
  });
});

describe("waarden", () => {
  it("parseDecimal begrijpt Nederlandse en internationale notatie", () => {
    expect(parseDecimal("1.234,56", "x")).toBe("1234.56");
    expect(parseDecimal("1,234.56", "x")).toBe("1234.56");
    expect(parseDecimal("€ 12,5", "x")).toBe("12.5");
    expect(parseDecimal("", "x")).toBeNull();
    expect(() => parseDecimal("-3", "x")).toThrow(ValueError);
  });

  it("parsePublicHttpsUrl blokkeert interne adressen (SSRF)", () => {
    for (const bad of ["https://127.0.0.1/a", "https://localhost/a", "https://[::1]/a", "https://intranet/a", "https://user:pw@shop.nl/a", "https://printer.local/a"]) {
      expect(() => parsePublicHttpsUrl(bad, "url")).toThrow(ValueError);
    }
    expect(parsePublicHttpsUrl("https://cdn.voorbeeld.nl/a.jpg", "url")).toBe("https://cdn.voorbeeld.nl/a.jpg");
  });

  it("sanitizeDescription verwijdert gevaarlijke HTML", () => {
    const html = sanitizeDescription('<p onclick="x()">Hoi<img src=x onerror=alert(1)><iframe src="https://x"></iframe><a href="javascript:x">link</a></p>');
    expect(html).toBe("<p>Hoilink</p>");
    // Platte tekst: alinea's en regeleinden blijven behouden, speciale tekens worden ge-escaped.
    expect(sanitizeDescription("Regel 1\nRegel 2 & 3 > 2\n\nAlinea 2")).toBe(
      "<p>Regel 1<br />Regel 2 &amp; 3 &gt; 2</p><p>Alinea 2</p>",
    );
    expect(sanitizeDescription("   ")).toBeNull();
  });
});

describe("duplicaatdetectie", () => {
  const products = parse(sample).products;

  it("herkent al geïmporteerde producten en dezelfde bron-URL", () => {
    const dups = detectDuplicates(products, {
      importedSourceKeys: new Set(["csv:NN-1001"]),
      importedSourceUrls: new Set(["https://VOORBEELDLEVERANCIER.nl/producten/nn-1002/?utm_source=x"]),
    });
    expect(dups.get("csv:NN-1001")!.reason).toBe("ALREADY_IMPORTED");
    expect(dups.get("csv:NN-1002")!.reason).toBe("SAME_SOURCE_URL");
    expect(dups.has("csv:NN-1003")).toBe(false);
  });

  it("herkent dubbele bron-URL's binnen hetzelfde bestand", () => {
    const r = parse(
      "external_id,title,cost_price,source_url\nA,Een,1,https://lev.nl/p/1\nB,Twee,1,https://lev.nl/p/1#fotos",
    );
    const dups = detectDuplicates(r.products, { importedSourceKeys: new Set(), importedSourceUrls: new Set() });
    expect(dups.get("csv:B")!.reason).toBe("DUPLICATE_IN_FILE");
    expect(dups.has("csv:A")).toBe(false);
  });
});
