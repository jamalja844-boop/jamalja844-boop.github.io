import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import db from "../../app/db.server";
import { clearFeedCache, createFeedSource } from "../../app/services/feed-sources.server";
import { importFromUrl } from "../../app/services/url-import.server";
import { createPreview, getJob } from "../../app/services/import.server";
import { parseManualProduct } from "../../app/lib/import/manual";
import { createDefaultRule, createShop, fakeEcbFetch, resetDatabase } from "./helpers";

const xmlFeed = readFileSync(new URL("../../public/voorbeeld/noblenest-voorbeeldfeed.xml", import.meta.url), "utf8");
const feedFetch = (body: string, type = "application/xml") => {
  const calls: string[] = [];
  return { calls, fetchImpl: async (url: string) => (calls.push(url), new Response(body, { status: 200, headers: { "content-type": type } })) };
};

describe("product importeren via URL", () => {
  beforeEach(async () => {
    await resetDatabase();
    clearFeedCache();
  });

  it("vindt een productlink in een gekoppelde feed en maakt een voorbeeld van alleen dat product", async () => {
    const shop = await createShop();
    await createDefaultRule(shop.id);
    await createFeedSource(shop.id, { name: "Voorbeeldleverancier", format: "XML", url: "https://feeds.voorbeeldleverancier.nl/google.xml", label: null, imageRights: false }, null);
    const f = feedFetch(xmlFeed);
    const result = await importFromUrl(shop, null, "https://voorbeeldleverancier.nl/producten/nf-2002/?utm_source=mail", { fetchOptions: { fetchImpl: f.fetchImpl }, ecbFetch: fakeEcbFetch });
    expect(result.kind).toBe("PREVIEW");
    const job = (await getJob(shop.id, (result as { jobId: string }).jobId))!;
    expect(job.type).toBe("URL");
    expect(job.items.map((i) => i.externalId)).toEqual(["NF-2002"]);
    expect(f.calls).toEqual(["https://feeds.voorbeeldleverancier.nl/google.xml"]);
  });

  it("leest een directe feed-URL eenmalig in", async () => {
    const shop = await createShop();
    await createDefaultRule(shop.id);
    const f = feedFetch(xmlFeed);
    const result = await importFromUrl(shop, null, "https://lev.nl/export/feed.xml", { fetchOptions: { fetchImpl: f.fetchImpl }, ecbFetch: fakeEcbFetch });
    expect(result.kind).toBe("PREVIEW");
    expect((await getJob(shop.id, (result as { jobId: string }).jobId))!.items).toHaveLength(2);
  });

  it("weigert HTML-pagina's als feed en haalt gewone productpagina's niet op", async () => {
    const shop = await createShop();
    const html = feedFetch("<html></html>", "text/html");
    const asFeed = await importFromUrl(shop, null, "https://lev.nl/feed.xml", { fetchOptions: { fetchImpl: html.fetchImpl } });
    expect(asFeed).toMatchObject({ kind: "INFO", tone: "critical" });
    expect((asFeed as { message: string }).message).toMatch(/Onverwacht bestandstype/);

    const page = feedFetch("<html></html>", "text/html");
    const result = await importFromUrl(shop, null, "https://webshop-van-iemand.nl/producten/lamp", { fetchOptions: { fetchImpl: page.fetchImpl } });
    expect(result).toMatchObject({ kind: "INFO", tone: "info" });
    expect(page.calls).toEqual([]); // niets opgehaald
    expect(await db.importJob.count()).toBe(0);
  });

  it("geeft uitleg bij marktplaatsen en weigert onveilige adressen", async () => {
    const shop = await createShop();
    expect(await importFromUrl(shop, null, "https://nl.aliexpress.com/item/1005001.html")).toMatchObject({ kind: "INFO", tone: "warning" });
    expect(await importFromUrl(shop, null, "https://www.temu.com/goods.html")).toMatchObject({ kind: "INFO", tone: "warning" });
    expect(await importFromUrl(shop, null, "http://lev.nl/feed.xml")).toMatchObject({ kind: "INFO", tone: "critical" });
    expect(await importFromUrl(shop, null, "https://192.168.1.10/feed.xml")).toMatchObject({ kind: "INFO", tone: "critical" });
  });
});

describe("handmatige invoer → voorbeeld", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("maakt een importtaak van type MANUAL met prijs en controles", async () => {
    const shop = await createShop();
    await createDefaultRule(shop.id);
    const parsed = parseManualProduct({ title: "Linnen tafelkleed", costPrice: "18,50", sku: "TK-01", imageRightsConfirmed: false }, "EUR");
    const { job } = await createPreview({ shop, userId: null, sourceName: "Handmatig", format: "JSON", parsed, supplierKey: "manual", jobType: "MANUAL", fetchImpl: fakeEcbFetch });
    const full = (await getJob(shop.id, job.id))!;
    expect(full).toMatchObject({ type: "MANUAL", supplierKey: "manual" });
    expect(full.items[0]!.selected).toBe(true);
    // 18,50 × 2,2 (120% opslag) × 1,21 (btw) = 49,247 → afgerond op ,95 = 49,95
    expect((full.items[0]!.pricing as any).minPrice).toBe("49.95");
  });
});
