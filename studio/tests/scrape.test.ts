import { beforeEach, describe, expect, it, vi } from "vitest";

const responses = new Map<string, { status: number; body: string; contentType?: string }>();
vi.mock("@/lib/server/safeFetch", () => ({
  assertPublicUrl: async (u: string) => new URL(u),
  robotsAllows: async (u: URL) => !(responses.get(`${u.origin}/robots.txt`)?.body ?? "").includes("Disallow: /"),
  safeFetch: async (u: string) => {
    const r = responses.get(u);
    if (!r) return { url: u, status: 404, contentType: "text/plain", body: Buffer.from("") };
    return { url: u, status: r.status, contentType: r.contentType ?? "text/html", body: Buffer.from(r.body) };
  },
}));

const { scrapeProduct } = await import("@/lib/server/scrape");

beforeEach(() => responses.clear());

describe("product scraper", () => {
  it("reads schema.org JSON-LD, OpenGraph, colors and fonts", async () => {
    responses.set("https://shop.test/p/kettle", {
      status: 200,
      body: `<html><head><title>Kettle | Shop</title>
      <meta property="og:site_name" content="Brewly"><meta name="theme-color" content="#0f766e">
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@700&family=Inter" rel="stylesheet">
      <style>:root{--brand-primary:#0f766e;--accent-color:#f59e0b}</style>
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Smart Kettle","description":"Boils in 90 seconds. Keeps warm for 2 hours.","image":["/img/kettle-1.jpg","https://cdn.test/kettle-2.jpg"],"brand":{"@type":"Brand","name":"Brewly"},"offers":{"@type":"Offer","price":"79.00","priceCurrency":"EUR"},"aggregateRating":{"@type":"AggregateRating","ratingValue":"4.6","reviewCount":"212"}}</script>
      </head><body><img class="site-logo" src="/logo.png"></body></html>`,
    });
    const r = await scrapeProduct("https://shop.test/p/kettle");
    expect(r.name).toBe("Smart Kettle");
    expect(r.brandName).toBe("Brewly");
    expect(r.price).toBe("79");
    expect(r.currency).toBe("€");
    expect(r.rating).toEqual({ value: 4.6, count: 212 });
    expect(r.images).toContain("https://shop.test/img/kettle-1.jpg");
    expect(r.logo).toBe("https://shop.test/logo.png");
    expect(r.colors[0]).toBe("#0f766e");
    expect(r.fonts).toContain("Poppins");
    expect(r.sources).toContain("schema.org Product (JSON-LD)");
  });

  it("uses the public Shopify product JSON including compare-at price", async () => {
    responses.set("https://store.test/products/hoodie", { status: 200, body: `<html><head><script src="https://cdn.shopify.com/s/x.js"></script><meta property="og:title" content="Hoodie"></head></html>` });
    responses.set("https://store.test/products/hoodie.json", {
      status: 200, contentType: "application/json",
      body: JSON.stringify({ product: { title: "Cloud Hoodie", vendor: "Nimbus", body_html: "<p>Ultra soft.</p><ul><li>Organic cotton</li><li>Relaxed fit</li></ul>", variants: [{ price: "59.00", compare_at_price: "79.00" }], images: [{ src: "https://cdn.shopify.com/a.jpg" }] } }),
    });
    const r = await scrapeProduct("https://store.test/products/hoodie");
    expect(r.platform).toBe("shopify");
    expect(r.name).toBe("Cloud Hoodie");
    expect(r.price).toBe("59");
    expect(r.oldPrice).toBe("79");
    expect(r.features).toEqual(["Organic cotton", "Relaxed fit"]);
    expect(r.images).toEqual(["https://cdn.shopify.com/a.jpg"]);
  });

  it("respects robots.txt", async () => {
    responses.set("https://blocked.test/robots.txt", { status: 200, body: "User-agent: *\nDisallow: /" });
    await expect(scrapeProduct("https://blocked.test/p")).rejects.toThrow(/robots/);
  });
});
