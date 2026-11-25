import { beforeEach, describe, expect, it, vi } from "vitest";

const responses = new Map<string, string>();
vi.mock("@/lib/server/safeFetch", () => ({
  assertPublicUrl: async (u: string) => new URL(u),
  robotsAllows: async () => true,
  safeFetch: async (u: string) => {
    const body = responses.get(u);
    return { url: u, status: body === undefined ? 404 : 200, contentType: "text/html", body: Buffer.from(body ?? "") };
  },
}));
const { scanShop } = await import("@/lib/server/shop");
const { generateMusic, MUSIC_MOODS } = await import("@/lib/engine/music");

beforeEach(() => responses.clear());

describe("webshop scan", () => {
  it("lists Shopify products from /products.json with currency", async () => {
    responses.set("https://shop.test/", `<html><head><meta property="og:site_name" content="Nimbus"><meta name="theme-color" content="#1d4ed8"></head></html>`);
    responses.set("https://shop.test/products.json?limit=24&page=1", JSON.stringify({ products: [
      { id: 1, title: "Cloud Hoodie", handle: "cloud-hoodie", vendor: "Nimbus", body_html: "<p>Soft.</p><ul><li>Organic cotton</li></ul>", variants: [{ price: "59.00", compare_at_price: "79.00" }], images: [{ src: "https://cdn.test/a.jpg" }] },
      { id: 2, title: "Rain Jacket", handle: "rain-jacket", body_html: "Waterproof", variants: [{ price: "120.00" }], images: [] },
    ] }));
    responses.set("https://shop.test/products.json?limit=24&page=2", JSON.stringify({ products: [] }));
    responses.set("https://shop.test/cart.js", JSON.stringify({ currency: "EUR" }));
    const r = await scanShop("https://shop.test/", 24);
    expect(r.platform).toBe("shopify");
    expect(r.shopName).toBe("Nimbus");
    expect(r.products).toHaveLength(2);
    expect(r.products[0]).toMatchObject({ name: "Cloud Hoodie", price: "59", oldPrice: "79", currency: "€", url: "https://shop.test/products/cloud-hoodie", features: ["Organic cotton"] });
    expect(r.colors[0]).toBe("#1d4ed8");
  });

  it("lists WooCommerce products from the Store API", async () => {
    responses.set("https://woo.test/", `<html><body class="woocommerce"></body></html>`);
    responses.set("https://woo.test/wp-json/wc/store/v1/products?per_page=24", JSON.stringify([
      { id: 7, name: "Olive Oil", short_description: "<p>Cold pressed</p>", permalink: "https://woo.test/product/olive-oil", prices: { price: "1295", regular_price: "1595", currency_minor_unit: 2, currency_symbol: "€" }, images: [{ src: "https://woo.test/o.jpg" }], review_count: 3, average_rating: "4.67" },
    ]));
    const r = await scanShop("https://woo.test/", 24);
    expect(r.platform).toBe("woocommerce");
    expect(r.products[0]).toMatchObject({ name: "Olive Oil", price: "12.95", oldPrice: "15.95", currency: "€", rating: { value: 4.67, count: 3 } });
  });

  it("falls back to sitemap product pages for other shops", async () => {
    responses.set("https://gen.test/", `<html><head><title>Gen</title></head></html>`);
    responses.set("https://gen.test/sitemap.xml", `<?xml version="1.0"?><urlset><url><loc>https://gen.test/product/lamp</loc></url><url><loc>https://gen.test/about</loc></url></urlset>`);
    responses.set("https://gen.test/product/lamp", `<html><head><script type="application/ld+json">{"@type":"Product","name":"Desk Lamp","description":"Warm light.","image":"https://gen.test/lamp.jpg","offers":{"price":"39","priceCurrency":"EUR"}}</script></head></html>`);
    const r = await scanShop("https://gen.test/", 24);
    expect(r.platform).toBe("generic");
    expect(r.products.map((p) => p.name)).toEqual(["Desk Lamp"]);
  });
});

describe("music generator", () => {
  it("produces a valid stereo WAV of the requested length for every mood", () => {
    for (const m of MUSIC_MOODS) {
      const wav = generateMusic({ mood: m, seconds: 3, seed: 3 });
      expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
      expect(wav.readUInt16LE(22)).toBe(2);
      expect((wav.length - 44) / 4).toBe(3 * 44100);
      let peak = 0;
      for (let i = 44; i < wav.length; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i)));
      expect(peak).toBeGreaterThan(5000);
    }
  });
});
