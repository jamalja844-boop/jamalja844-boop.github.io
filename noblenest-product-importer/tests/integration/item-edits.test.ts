import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import db from "../../app/db.server";
import { createCsvPreview, getJob, startImport } from "../../app/services/import.server";
import { saveItemEdits, type StoredPricing } from "../../app/services/item-edits.server";
import { createDefaultRule, createFakeShopify, createShop, fakeEcbFetch, resetDatabase } from "./helpers";

const sample = readFileSync(new URL("../../public/voorbeeld/noblenest-voorbeeldcatalogus.csv", import.meta.url), "utf8");

async function setup() {
  const shop = await createShop();
  await createDefaultRule(shop.id);
  const { job } = await createCsvPreview({ shop, userId: null, fileName: "voorbeeld.csv", text: sample, supplierKey: "csv", fetchImpl: fakeEcbFetch });
  const full = (await getJob(shop.id, job.id))!;
  const item = (id: string) => full.items.find((i) => i.externalId === id)!;
  return { shop, job: full, item };
}

describe("bewerken in het importvoorbeeld", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("rekent een handmatige prijs door, waarschuwt bij verlies en kan terug naar automatisch", async () => {
    const { shop, job, item } = await setup();
    const linnen = item("NN-1001");

    const result = await saveItemEdits(shop.id, job.id, linnen.id, { overrides: {}, prices: { "NN-1001-140": "149,00", "NN-1001-200": "30" } }, null, fakeEcbFetch);
    expect(result.warnings).toHaveLength(1); // 30 euro < kostprijs 45,95
    let pricing = (await db.importJobItem.findUniqueOrThrow({ where: { id: linnen.id } })).pricing as unknown as StoredPricing;
    expect(pricing.manualVariants).toEqual(["NN-1001-140", "NN-1001-200"]);
    expect(pricing.variants["NN-1001-140"]!.breakdown!.sellingPrice).toBe("149.00");
    expect(pricing.variants["NN-1001-200"]!.breakdown!.estimatedProfit).toBe("-21.16");
    expect(pricing.variants["NN-1001-240"]!.breakdown!.sellingPrice).toBe("135.95"); // automatisch
    expect([pricing.minPrice, pricing.maxPrice]).toEqual(["30.00", "149.00"]);

    // Velden leegmaken = terug naar de automatisch berekende prijzen
    await saveItemEdits(shop.id, job.id, linnen.id, { overrides: {}, prices: {} }, null, fakeEcbFetch);
    pricing = (await db.importJobItem.findUniqueOrThrow({ where: { id: linnen.id } })).pricing as unknown as StoredPricing;
    expect(pricing.manualVariants).toBeUndefined();
    expect(pricing.variants["NN-1001-140"]!.breakdown!.sellingPrice).toBe("99.95");
  });

  it("valideert invoer en bewaart de leveranciersgegevens ongewijzigd", async () => {
    const { shop, job, item } = await setup();
    const kussen = item("NN-1002");
    await expect(saveItemEdits(shop.id, job.id, kussen.id, { overrides: {}, prices: { "NN-1002-SAL": "-5" } }, null)).rejects.toThrow(/Ongeldige prijs/);
    await expect(saveItemEdits(shop.id, job.id, kussen.id, { overrides: { images: ["https://elders.nl/foto.jpg"] }, prices: {} }, null)).rejects.toThrow(/Onbekende afbeelding/);
    await expect(
      saveItemEdits(shop.id, job.id, kussen.id, { overrides: { images: ["https://picsum.photos/id/1067/1200/1200"], variantImages: { "NN-1002-SAL": "https://picsum.photos/id/1068/1200/1200" } }, prices: {} }, null),
    ).rejects.toThrow(/ook bij de geselecteerde afbeeldingen/);

    await saveItemEdits(shop.id, job.id, kussen.id, { overrides: { title: "Velours sierkussen — saliegroen", descriptionHtml: "<p>Nieuw<script>x</script></p>" }, prices: {} }, null);
    const stored = await db.importJobItem.findUniqueOrThrow({ where: { id: kussen.id } });
    expect(stored.overrides).toEqual({ title: "Velours sierkussen — saliegroen", descriptionHtml: "<p>Nieuw</p>" });
    expect((stored.payload as { title: string }).title).toBe("Fluwelen sierkussen Velours");
    expect(await db.auditLog.count({ where: { action: "import.item.edited" } })).toBe(1);
  });

  it("geeft bewerkingen door aan Shopify bij de import", async () => {
    const { shop, job, item } = await setup();
    const kussen = item("NN-1002");
    await saveItemEdits(
      shop.id,
      job.id,
      kussen.id,
      {
        overrides: {
          title: "Velours sierkussen",
          tags: ["Woonkamer", "Velours"],
          seoTitle: "Velours sierkussen | Noblenest",
          images: ["https://picsum.photos/id/1068/1200/1200", "https://picsum.photos/id/1067/1200/1200"],
          variantImages: { "NN-1002-OKR": null },
          collections: ["gid://shopify/Collection/77"],
        },
        prices: { "NN-1002-SAL": "39,95" },
      },
      null,
      fakeEcbFetch,
    );
    const fake = createFakeShopify();
    await startImport(shop.id, job.id, fake.client, { imageRightsConfirmed: false, userId: null });
    const created = [...fake.products.values()].find((p) => p.sourceId === "csv:NN-1002")!;
    expect(created.input).toMatchObject({
      title: "Velours sierkussen",
      status: "DRAFT",
      tags: ["Woonkamer", "Velours"],
      seo: { title: "Velours sierkussen | Noblenest" },
      collections: ["gid://shopify/Collection/77"],
    });
    expect(created.input.files.map((f: any) => f.originalSource)).toEqual(["https://picsum.photos/id/1068/1200/1200", "https://picsum.photos/id/1067/1200/1200"]);
    expect(created.input.variants.map((v: any) => [v.price, v.file?.originalSource ?? null])).toEqual([
      ["39.95", "https://picsum.photos/id/1068/1200/1200"],
      [expect.any(String), null],
      [expect.any(String), null],
    ]);
    // Alleen gebruikte foto's als 'geïmporteerd' gemarkeerd
    const images = await db.productImage.findMany({ where: { supplierProduct: { externalId: "NN-1002" } }, orderBy: { position: "asc" } });
    expect(images.map((i) => i.importedToShopify)).toEqual([true, true, false, false]);
  });

  it("staat bewerken niet meer toe na de start en niet vanuit een andere winkel", async () => {
    const { shop, job, item } = await setup();
    const other = await createShop("ander.myshopify.com");
    await expect(saveItemEdits(other.id, job.id, item("NN-1005").id, { overrides: { title: "x" }, prices: {} }, null)).rejects.toThrow(/niet gevonden/);
    await startImport(shop.id, job.id, createFakeShopify().client, { imageRightsConfirmed: false, userId: null });
    await expect(saveItemEdits(shop.id, job.id, item("NN-1005").id, { overrides: { title: "x" }, prices: {} }, null)).rejects.toThrow(/vóór het starten/);
  });
});
