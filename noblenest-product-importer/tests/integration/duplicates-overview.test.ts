import { beforeEach, describe, expect, it } from "vitest";
import db from "../../app/db.server";
import { ensureSupplierRegistry, resetSupplierRegistryCache } from "../../app/services/suppliers.server";
import { findPossibleDuplicates, normalizeGtin, normalizeTitle } from "../../app/services/duplicates-overview.server";
import { createShop, resetDatabase } from "./helpers";

let counter = 0;
async function imported(shopId: string, supplierKey: string, data: { title: string; gtin?: string; sourceUrl?: string; barcode?: string }) {
  const supplier = await db.supplier.findUniqueOrThrow({ where: { key: supplierKey } });
  const n = ++counter;
  const sp = await db.supplierProduct.create({
    data: {
      shopId,
      supplierId: supplier.id,
      externalId: `P${n}`,
      title: data.title,
      gtin: data.gtin,
      sourceUrl: data.sourceUrl,
      rawData: [],
      status: "IMPORTED",
      variants: { create: [{ externalId: `P${n}-v`, options: [], barcode: data.barcode }] },
    },
  });
  await db.shopifyProductMapping.create({
    data: { shopId, supplierProductId: sp.id, shopifyProductId: `gid://shopify/Product/${n}`, sourceKey: `${supplierKey}:P${n}` },
  });
  return sp;
}

describe("mogelijke duplicaten", () => {
  beforeEach(async () => {
    await resetDatabase();
    resetSupplierRegistryCache();
    await ensureSupplierRegistry();
  });

  it("groepeert producten met dezelfde EAN, bron-URL of titel — ook tussen leveranciers", async () => {
    const shop = await createShop();
    await imported(shop.id, "csv", { title: "Messing wandlamp", gtin: "08712345000011" });
    await imported(shop.id, "xml-feed", { title: "Wandlamp messing (feed)", barcode: "8712345000011" });
    await imported(shop.id, "csv", { title: "Linnen plaid", sourceUrl: "https://lev.nl/p/plaid?utm_source=x" });
    await imported(shop.id, "json-feed", { title: "Plaid van linnen", sourceUrl: "https://LEV.nl/p/plaid/" });
    await imported(shop.id, "csv", { title: "Keramische Vaas — Dune" });
    await imported(shop.id, "manual", { title: "keramische vaas dune" });
    await imported(shop.id, "csv", { title: "Uniek product" });

    const groups = await findPossibleDuplicates(shop.id);
    expect(groups).toHaveLength(3);
    const byReason = Object.fromEntries(groups.map((g) => [g.reasons.join(","), g.products.map((p) => p.supplier).sort()]));
    expect(byReason).toEqual({
      GTIN: ["CSV-bestand", "XML-productfeed"],
      BRON_URL: ["CSV-bestand", "JSON-productfeed"],
      TITEL: ["CSV-bestand", "Handmatige invoer"],
    });
  });

  it("toont alleen producten van de eigen winkel", async () => {
    const a = await createShop("a.myshopify.com");
    const b = await createShop("b.myshopify.com");
    await imported(a.id, "csv", { title: "Messing wandlamp", gtin: "8712345000011" });
    await imported(b.id, "csv", { title: "Messing wandlamp", gtin: "8712345000011" });
    expect(await findPossibleDuplicates(a.id)).toEqual([]);
  });

  it("normaliseert titels en EAN's", () => {
    expect(normalizeTitle("Keramische Vaas — Dune!")).toBe("keramische vaas dune");
    expect(normalizeGtin("0871-2345-000011")).toBe("8712345000011");
    expect(normalizeGtin("123")).toBeNull();
  });
});
