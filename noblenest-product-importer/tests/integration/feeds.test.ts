import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import db from "../../app/db.server";
import {
  checkFeedSource,
  clearFeedCache,
  createFeedSource,
  deleteFeedSource,
  getFeedCatalog,
  listFeedSources,
  loadFeedSource,
} from "../../app/services/feed-sources.server";
import { createPreview, getJob, startImport } from "../../app/services/import.server";
import { createDefaultRule, createFakeShopify, createShop, fakeEcbFetch, resetDatabase } from "./helpers";

const xmlFeed = readFileSync(new URL("../../public/voorbeeld/noblenest-voorbeeldfeed.xml", import.meta.url), "utf8");
const jsonFeed = readFileSync(new URL("../../public/voorbeeld/noblenest-voorbeeldfeed.json", import.meta.url), "utf8");
const FEED_URL = "https://feeds.voorbeeldleverancier.nl/export/google.xml?apikey=supergeheim123";

function feedFetch(body: string, contentType = "application/xml") {
  const calls: string[] = [];
  const fetchImpl = async (url: string) => {
    calls.push(url);
    return new Response(body, { status: 200, headers: { "content-type": contentType } });
  };
  return { fetchImpl, calls };
}

describe("feedbronnen", () => {
  beforeEach(async () => {
    await resetDatabase();
    clearFeedCache();
  });

  it("slaat de feed-URL alleen versleuteld op en toont alleen host + pad", async () => {
    const shop = await createShop();
    const row = await createFeedSource(shop.id, { name: "Voorbeeldleverancier", format: "XML", url: FEED_URL, label: "voorbeeld", imageRights: false }, null);
    const stored = await db.supplierConnection.findUniqueOrThrow({ where: { id: row.id } });
    expect(stored.credentialsEncrypted).not.toContain("supergeheim");
    expect(JSON.stringify(stored.config)).not.toContain("supergeheim");
    const list = await listFeedSources(shop.id);
    expect(list[0]).toMatchObject({ name: "Voorbeeldleverancier", format: "XML", host: "feeds.voorbeeldleverancier.nl/export/google.xml", status: "NOT_CONFIGURED" });
    expect(JSON.stringify(list)).not.toContain("supergeheim");
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "feed.source.created" } });
    expect(log.message).not.toContain("supergeheim");
  });

  it("weigert onveilige feed-URL's en dubbele namen", async () => {
    const shop = await createShop();
    for (const url of ["http://lev.nl/feed.xml", "https://10.0.0.8/feed.xml", "https://localhost/feed"]) {
      await expect(createFeedSource(shop.id, { name: url, format: "XML", url, label: null, imageRights: false }, null)).rejects.toThrow();
    }
    await createFeedSource(shop.id, { name: "A", format: "XML", url: FEED_URL, label: null, imageRights: false }, null);
    await expect(createFeedSource(shop.id, { name: "A", format: "XML", url: FEED_URL, label: null, imageRights: false }, null)).rejects.toThrow(/naam/);
  });

  it("controleert de verbinding en registreert succes en fouten", async () => {
    const shop = await createShop();
    const row = await createFeedSource(shop.id, { name: "Feed", format: "XML", url: FEED_URL, label: null, imageRights: false }, null);
    const ok = feedFetch(xmlFeed);
    const result = await checkFeedSource(shop.id, row.id, null, { defaultCurrency: "EUR", fetchOptions: { fetchImpl: ok.fetchImpl } });
    expect(result).toEqual({ ok: true, message: 'Feed "Feed" bereikbaar: 2 producten, 0 regelfout(en).' });
    expect(ok.calls).toEqual([FEED_URL]);
    expect((await listFeedSources(shop.id))[0]).toMatchObject({ status: "CONNECTED", productCount: 2, errorCount: 0 });

    const failing = async () => new Response("nee", { status: 403, headers: { "content-type": "text/plain" } });
    const bad = await checkFeedSource(shop.id, row.id, null, { defaultCurrency: "EUR", fetchOptions: { fetchImpl: failing } });
    expect(bad).toEqual({ ok: false, message: "De feed gaf HTTP 403." });
    expect((await listFeedSources(shop.id))[0]).toMatchObject({ status: "ERROR", lastError: "De feed gaf HTTP 403." });
  });

  it("bewaart de catalogus kort in de cache voor zoeken", async () => {
    const shop = await createShop();
    const row = await createFeedSource(shop.id, { name: "JSON", format: "JSON", url: "https://lev.nl/feed.json", label: null, imageRights: true }, null);
    const f = feedFetch(jsonFeed, "application/json");
    const first = await getFeedCatalog(shop.id, row.id, { defaultCurrency: "EUR", fetchOptions: { fetchImpl: f.fetchImpl } });
    const second = await getFeedCatalog(shop.id, row.id, { defaultCurrency: "EUR", fetchOptions: { fetchImpl: f.fetchImpl } });
    expect(first.parsed.products).toHaveLength(2);
    expect(second.parsed.products).toHaveLength(2);
    expect(f.calls).toHaveLength(1);
    await getFeedCatalog(shop.id, row.id, { defaultCurrency: "EUR", refresh: true, fetchOptions: { fetchImpl: f.fetchImpl } });
    expect(f.calls).toHaveLength(2);
  });

  it("importeert een selectie uit een XML-feed als concept", async () => {
    const shop = await createShop();
    await createDefaultRule(shop.id);
    const row = await createFeedSource(shop.id, { name: "Feed", format: "XML", url: FEED_URL, label: "voorbeeld", imageRights: false }, null);
    const { parsed } = await loadFeedSource(shop.id, row.id, { defaultCurrency: "EUR", fetchOptions: { fetchImpl: feedFetch(xmlFeed).fetchImpl } });

    const { job } = await createPreview({
      shop,
      userId: null,
      sourceName: "Feed",
      format: "XML",
      parsed,
      onlyExternalIds: ["voorbeeld:NF-2001"],
      fetchImpl: fakeEcbFetch,
    });
    const preview = (await getJob(shop.id, job.id))!;
    expect(preview.type).toBe("XML");
    expect(preview.supplierKey).toBe("xml-feed");
    expect(preview.items.map((i) => i.externalId)).toEqual(["voorbeeld:NF-2001"]);

    const fake = createFakeShopify();
    const result = await startImport(shop.id, job.id, fake.client, { imageRightsConfirmed: false, userId: null });
    expect(result.status).toBe("COMPLETED");
    const product = [...fake.products.values()][0]!;
    expect(product.status).toBe("DRAFT");
    expect(product.sourceId).toBe("xml-feed:voorbeeld:NF-2001");
    expect(product.input.productOptions).toEqual([{ name: "Kleur", position: 1, values: [{ name: "Antraciet" }, { name: "Zand" }] }]);
    // Geen bevestigde beeldrechten → geen afbeeldingen naar Shopify
    expect(product.input.files).toBeUndefined();
    expect(product.input.variants.every((v: any) => v.file === undefined)).toBe(true);

    // Opnieuw dezelfde feed: duplicaat
    const again = await createPreview({ shop, userId: null, sourceName: "Feed", format: "XML", parsed, fetchImpl: fakeEcbFetch });
    const againJob = (await getJob(shop.id, again.job.id))!;
    expect(againJob.items.find((i) => i.externalId === "voorbeeld:NF-2001")!.status).toBe("SKIPPED_DUPLICATE");
  });

  it("isoleert feedbronnen per winkel", async () => {
    const a = await createShop("a.myshopify.com");
    const b = await createShop("b.myshopify.com");
    const row = await createFeedSource(a.id, { name: "Feed", format: "XML", url: FEED_URL, label: null, imageRights: false }, null);
    await expect(loadFeedSource(b.id, row.id, { defaultCurrency: "EUR", fetchOptions: { fetchImpl: feedFetch(xmlFeed).fetchImpl } })).rejects.toThrow(/niet gevonden/);
    await expect(deleteFeedSource(b.id, row.id, null)).rejects.toThrow(/niet gevonden/);
    expect(await listFeedSources(b.id)).toEqual([]);
  });
});
