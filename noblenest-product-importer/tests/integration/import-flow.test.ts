import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import db from "../../app/db.server";
import {
  cancelImport,
  createCsvPreview,
  getJob,
  processJob,
  retryFailed,
  setSelection,
  startImport,
  type ItemFlags,
} from "../../app/services/import.server";
import { createDefaultRule, createFakeShopify, createShop, fakeEcbFetch, resetDatabase } from "./helpers";

const sample = readFileSync(new URL("../../public/voorbeeld/noblenest-voorbeeldcatalogus.csv", import.meta.url), "utf8");

async function preview(shop: { id: string; currencyCode: string | null }, text = sample) {
  const { job } = await createCsvPreview({ shop, userId: null, fileName: "voorbeeld.csv", text, supplierKey: "csv", fetchImpl: fakeEcbFetch });
  return (await getJob(shop.id, job.id))!;
}

describe("CSV-import naar Shopify (concept)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("maakt een voorbeeld met prijzen, meldingen en veilige standaardselectie", async () => {
    const shop = await createShop();
    await createDefaultRule(shop.id);
    const job = await preview(shop);

    expect(job.status).toBe("PREVIEW");
    expect(job.items).toHaveLength(6);
    const byId = new Map(job.items.map((i) => [i.externalId, i]));

    // Zonder inkoopprijs: geblokkeerd en niet geselecteerd.
    expect((byId.get("NN-1006")!.flags as unknown as ItemFlags).blocking).toBe(true);
    expect(byId.get("NN-1006")!.selected).toBe(false);
    // Waarschuwingen blokkeren niet.
    expect(byId.get("NN-1004")!.selected).toBe(true);

    // (46,00 inkoop + 4,95 verzending) × 2,2 × 1,21 btw = 135,6289 → ,95-afronding = 135,95
    const pricing = byId.get("NN-1001")!.pricing as any;
    expect(pricing.variants["NN-1001-240"].breakdown.landedCost).toBe("50.95");
    expect(pricing.variants["NN-1001-240"].breakdown.sellingPrice).toBe("135.95");
    expect(pricing.ruleName).toBe("Standaard 120% opslag");
    // USD-product omgerekend met ECB-koers: 38,00 / 1,08 = 35,19 en 9,50 / 1,08 = 8,80
    const lamp = (byId.get("NN-1004")!.pricing as any).variants["NN-1004"].breakdown;
    expect(lamp.costPrice).toBe("35.19");
    expect(lamp.shippingCost).toBe("8.80");
  });

  it("blokkeert alles zonder prijsregel", async () => {
    const shop = await createShop();
    const job = await preview(shop);
    expect(job.items.every((i) => !i.selected)).toBe(true);
    await expect(startImport(shop.id, job.id, createFakeShopify().client, { imageRightsConfirmed: false, userId: null })).rejects.toThrow(
      /Selecteer ten minste één product/,
    );
  });

  it("importeert geselecteerde producten uitsluitend als concept, met varianten en toegestane afbeeldingen", async () => {
    const shop = await createShop();
    await createDefaultRule(shop.id);
    const fake = createFakeShopify();
    const job = await preview(shop);

    const result = await startImport(shop.id, job.id, fake.client, { imageRightsConfirmed: false, userId: null });
    expect(result.status).toBe("COMPLETED");
    expect(result.byStatus).toMatchObject({ IMPORTED: 5, CANCELLED: 1 });

    // Alle aangemaakte producten zijn DRAFT.
    expect([...fake.products.values()].every((p) => p.status === "DRAFT")).toBe(true);
    const createCalls = fake.calls.filter((c) => c.operation === "create");
    expect(createCalls).toHaveLength(5);

    const linnen = [...fake.products.values()].find((p) => p.sourceId === "csv:NN-1001")!;
    // (inkoop + 4,95) × 2,2 × 1,21, afgerond op ,95
    expect(linnen.input.variants.map((v: any) => v.price)).toEqual(["99.95", "122.95", "135.95"]);
    expect(linnen.input.variants.map((v: any) => v.inventoryItem.cost)).toEqual(["37.45", "45.95", "50.95"]);
    expect(linnen.input.files).toHaveLength(2);
    // Lamp: beeldrechten niet bevestigd → geen afbeeldingen.
    const lamp = [...fake.products.values()].find((p) => p.sourceId === "csv:NN-1004")!;
    expect(lamp.input.files).toBeUndefined();

    // Koppelingen en bronvarianten in de database.
    const mappings = await db.shopifyProductMapping.findMany({ where: { shopId: shop.id } });
    expect(mappings).toHaveLength(5);
    const variants = await db.productVariant.findMany({ where: { supplierProduct: { externalId: "NN-1001" } } });
    expect(variants.every((v) => v.shopifyVariantId?.startsWith("gid://shopify/ProductVariant/"))).toBe(true);
    const logs = await db.auditLog.count({ where: { shopId: shop.id, action: "import.item.created" } });
    expect(logs).toBe(5);
  });

  it("voorkomt duplicaten bij een tweede upload van hetzelfde bestand", async () => {
    const shop = await createShop();
    await createDefaultRule(shop.id);
    const fake = createFakeShopify();
    const first = await preview(shop);
    await startImport(shop.id, first.id, fake.client, { imageRightsConfirmed: false, userId: null });

    const second = await preview(shop);
    const imported = second.items.filter((i) => i.externalId !== "NN-1006");
    expect(imported.every((i) => i.status === "SKIPPED_DUPLICATE" && !i.selected)).toBe(true);
    await expect(startImport(shop.id, second.id, fake.client, { imageRightsConfirmed: false, userId: null })).rejects.toThrow();
    expect(fake.products.size).toBe(5);
  });

  it("maakt na een netwerkfout geen dubbel product aan (idempotent opnieuw proberen)", async () => {
    const shop = await createShop();
    await createDefaultRule(shop.id);
    const fake = createFakeShopify();
    // Shopify maakt het product aan, maar het antwoord gaat verloren.
    fake.overrides.create = async (variables) => {
      await fake.defaults.create(variables);
      throw new Error("socket hang up");
    };
    const job = await preview(shop);
    const firstRun = await startImport(shop.id, job.id, fake.client, { imageRightsConfirmed: false, userId: null });
    expect(firstRun.status).toBe("FAILED");
    expect(fake.products.size).toBe(5);
    const failed = await db.importJobItem.findFirstOrThrow({ where: { importJobId: job.id, status: "FAILED" } });
    expect(failed.lastError).toMatch(/uitkomst onbekend/);

    // Verbinding hersteld: opnieuw proberen koppelt de bestaande producten.
    delete fake.overrides.create;
    const retry = await retryFailed(shop.id, job.id, fake.client, { imageRightsConfirmed: false, userId: null });
    expect(retry.status).toBe("COMPLETED");
    expect(retry.byStatus.IMPORTED).toBe(5);
    expect(fake.products.size).toBe(5);
    expect(fake.calls.filter((c) => c.operation === "create")).toHaveLength(5);
    expect(await db.auditLog.count({ where: { action: "import.item.recovered" } })).toBe(5);
  });

  it("verwerkt Shopify-fouten per product en gaat door met de rest", async () => {
    const shop = await createShop();
    await createDefaultRule(shop.id);
    const fake = createFakeShopify();
    fake.overrides.create = (variables) => {
      const input = variables.input as any;
      if (input.title.startsWith("Messing")) {
        return { data: { productSet: { product: null, userErrors: [{ field: ["files", "0", "originalSource"], message: "Image URL is invalid", code: "INVALID" }] } } };
      }
      return fake.defaults.create(variables);
    };
    const job = await preview(shop);
    const result = await startImport(shop.id, job.id, fake.client, { imageRightsConfirmed: true, userId: null });
    expect(result.status).toBe("COMPLETED_WITH_ERRORS");
    expect(result.byStatus).toMatchObject({ IMPORTED: 4, FAILED: 1 });
    const failed = await db.importJobItem.findFirstOrThrow({ where: { importJobId: job.id, status: "FAILED" } });
    expect(failed.lastError).toBe("Shopify (afbeelding): Image URL is invalid");
    const jobRow = await db.importJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(jobRow).toMatchObject({ succeededItems: 4, failedItems: 1 });
  });

  it("respecteert selectie, batchlimiet en annulering", async () => {
    const shop = await createShop();
    await createDefaultRule(shop.id);
    const fake = createFakeShopify();
    const job = await preview(shop);

    // Geblokkeerd product kan niet via de server worden geselecteerd.
    const ids = job.items.map((i) => i.id);
    await setSelection(shop.id, job.id, ids);
    const blocked = await db.importJobItem.findFirstOrThrow({ where: { importJobId: job.id, externalId: "NN-1006" } });
    expect(blocked.selected).toBe(false);

    const paused = await startImport(shop.id, job.id, fake.client, { imageRightsConfirmed: false, userId: null, batchLimit: 2 });
    expect(paused.status).toBe("PAUSED");
    expect(paused.byStatus.IMPORTED).toBe(2);

    await cancelImport(shop.id, job.id, null);
    const after = await processJob(shop.id, job.id, fake.client, { imageRightsConfirmed: false, userId: null });
    expect(after.status).toBe("CANCELLED");
    expect(after.byStatus).toMatchObject({ IMPORTED: 2, CANCELLED: 4 });
    expect(fake.products.size).toBe(2);
  });

  it("geeft geen toegang tot imports van een andere winkel", async () => {
    const shopA = await createShop("a.myshopify.com");
    const shopB = await createShop("b.myshopify.com");
    await createDefaultRule(shopA.id);
    const job = await preview(shopA);
    expect(await getJob(shopB.id, job.id)).toBeNull();
    await expect(cancelImport(shopB.id, job.id, null)).rejects.toThrow();
    await expect(startImport(shopB.id, job.id, createFakeShopify().client, { imageRightsConfirmed: false, userId: null })).rejects.toThrow();
  });
});
