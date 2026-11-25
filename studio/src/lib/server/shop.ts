// Finds the products of a webshop from one link (shop home, collection/category or product page).
//  - Shopify: public /products.json (or /collections/<x>/products.json)
//  - WooCommerce: public Store API /wp-json/wc/store/v1/products
//  - Other shops: sitemap.xml product URLs, each read with the product scraper
import * as cheerio from "cheerio";
import { assertPublicUrl, robotsAllows, safeFetch } from "./safeFetch";
import { scrapeProduct } from "./scrape";

export interface ShopProduct {
  id: string;
  name: string;
  description: string;
  price?: string;
  oldPrice?: string;
  currency?: string;
  url: string;
  images: string[];
  features: string[];
  brandName?: string;
  rating?: { value: number; count: number };
}

export interface ShopScan {
  shopName: string;
  platform: "shopify" | "woocommerce" | "generic";
  products: ShopProduct[];
  logo?: string;
  colors: string[];
  fonts: string[];
  warnings: string[];
}

const SYM: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" };
const strip = (h: string) => cheerio.load(`<div>${h ?? ""}</div>`)("div").text().replace(/\s+/g, " ").trim();
const price = (v: unknown) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? (Number.isInteger(n) ? String(n) : n.toFixed(2)) : undefined;
};

async function getJson(url: string) {
  const r = await safeFetch(url, { accept: "application/json", maxBytes: 12 * 1024 * 1024, timeoutMs: 20000 });
  if (r.status >= 400) return null;
  try {
    return JSON.parse(r.body.toString("utf8"));
  } catch {
    return null;
  }
}

async function shopify(origin: string, path: string, limit: number): Promise<ShopProduct[] | null> {
  const coll = path.match(/\/collections\/([^/?#]+)/)?.[1];
  const prod = path.match(/\/products\/([^/?#]+)/)?.[1];
  if (prod) {
    const j = await getJson(`${origin}/products/${prod}.json`);
    return j?.product ? [mapShopify(origin, j.product, undefined)] : null;
  }
  const base = coll ? `${origin}/collections/${coll}/products.json` : `${origin}/products.json`;
  const out: ShopProduct[] = [];
  for (let page = 1; out.length < limit && page <= 4; page++) {
    const j = await getJson(`${base}?limit=${Math.min(250, limit)}&page=${page}`);
    if (!j?.products) return page === 1 ? null : out;
    if (!j.products.length) break;
    for (const p of j.products) out.push(mapShopify(origin, p, undefined));
  }
  // currency is not part of products.json: read it from the shop's public cart endpoint
  const cart = await getJson(`${origin}/cart.js`).catch(() => null);
  const cur = cart?.currency ? SYM[cart.currency] ?? `${cart.currency} ` : "€";
  return out.slice(0, limit).map((p) => ({ ...p, currency: cur }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapShopify(origin: string, p: any, currency?: string): ShopProduct {
  const v = p.variants?.[0];
  const $ = cheerio.load(p.body_html || "");
  const features: string[] = [];
  $("li").each((_, li) => {
    const t = $(li).text().replace(/\s+/g, " ").trim();
    if (t.length > 3 && t.length < 90 && features.length < 6) features.push(t);
  });
  return {
    id: `shopify_${p.id}`, name: p.title, description: strip(p.body_html || ""), brandName: p.vendor,
    price: price(v?.price), oldPrice: v?.compare_at_price && Number(v.compare_at_price) > Number(v.price) ? price(v.compare_at_price) : undefined,
    currency, url: `${origin}/products/${p.handle}`, images: (p.images ?? []).map((i: { src: string }) => i.src).slice(0, 8), features,
  };
}

async function woo(origin: string, path: string, limit: number): Promise<ShopProduct[] | null> {
  const slug = path.match(/\/product\/([^/?#]+)/)?.[1];
  const cat = path.match(/\/product-category\/(?:.*\/)?([^/?#]+)\/?$/)?.[1];
  let q = `per_page=${Math.min(100, limit)}`;
  if (slug) q = `slug=${encodeURIComponent(slug)}`;
  else if (cat) {
    const cats = await getJson(`${origin}/wp-json/wc/store/v1/products/categories?slug=${encodeURIComponent(cat)}`);
    if (cats?.[0]?.id) q += `&category=${cats[0].id}`;
  }
  const j = await getJson(`${origin}/wp-json/wc/store/v1/products?${q}`);
  if (!Array.isArray(j)) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return j.slice(0, limit).map((p: any) => {
    const minor = Number(p.prices?.currency_minor_unit ?? 2);
    const toP = (v: string) => price(Number(v) / Math.pow(10, minor));
    return {
      id: `woo_${p.id}`, name: strip(p.name), description: strip(p.short_description || p.description || ""),
      price: toP(p.prices?.price), oldPrice: p.prices?.regular_price !== p.prices?.price ? toP(p.prices?.regular_price) : undefined,
      currency: p.prices?.currency_symbol || SYM[p.prices?.currency_code] || "€", url: p.permalink,
      images: (p.images ?? []).map((i: { src: string }) => i.src).slice(0, 8), features: [],
      rating: Number(p.review_count) > 0 ? { value: Number(p.average_rating), count: Number(p.review_count) } : undefined,
    };
  });
}

async function sitemapProducts(origin: string, limit: number): Promise<string[]> {
  const seen = new Set<string>();
  const queue = [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/product-sitemap.xml`];
  const urls: string[] = [];
  while (queue.length && seen.size < 12 && urls.length < limit * 3) {
    const u = queue.shift()!;
    if (seen.has(u)) continue;
    seen.add(u);
    const r = await safeFetch(u, { maxBytes: 8 * 1024 * 1024 }).catch(() => null);
    if (!r || r.status >= 400) continue;
    const $ = cheerio.load(r.body.toString("utf8"), { xml: true });
    $("sitemap > loc").each((_, el) => { const l = $(el).text().trim(); if (/product/i.test(l) || seen.size < 4) queue.push(l); });
    $("url > loc").each((_, el) => {
      const l = $(el).text().trim();
      if (/\/(products?|p|artikel|produkt|producto|produit|item)\/[^/]+\/?$/i.test(new URL(l).pathname)) urls.push(l);
    });
  }
  return [...new Set(urls)].slice(0, limit);
}

export async function scanShop(rawUrl: string, limit = 24): Promise<ShopScan> {
  const target = await assertPublicUrl(rawUrl);
  if (!(await robotsAllows(target))) throw new Error("Deze webshop staat automatisch uitlezen niet toe (robots.txt). / This shop disallows automated access (robots.txt).");
  const origin = target.origin;
  const warnings: string[] = [];
  // read the landing page once for name, logo, colours and fonts
  let home: Awaited<ReturnType<typeof scrapeProduct>> | null = null;
  try {
    home = await scrapeProduct(target.toString());
  } catch (e) {
    warnings.push(e instanceof Error ? e.message : String(e));
  }
  const shopName = home?.siteName || target.hostname.replace(/^www\./, "");
  const base = { shopName, logo: home?.logo, colors: home?.colors ?? [], fonts: home?.fonts ?? [], warnings };

  const s = await shopify(origin, target.pathname, limit).catch(() => null);
  if (s?.length) return { ...base, platform: "shopify", products: s };
  const w = await woo(origin, target.pathname, limit).catch(() => null);
  if (w?.length) return { ...base, platform: "woocommerce", products: w };

  // generic shop: the link itself may be a product page
  const products: ShopProduct[] = [];
  if (home && home.name && (home.price || home.sources.includes("schema.org Product (JSON-LD)"))) {
    products.push({ id: `url_${products.length}`, name: home.name, description: home.description, price: home.price, oldPrice: home.oldPrice, currency: home.currency, url: home.url, images: home.images, features: home.features, brandName: home.brandName, rating: home.rating });
  } else {
    const urls = await sitemapProducts(origin, limit);
    if (!urls.length) warnings.push("Geen productlijst gevonden. Plak de link van een productpagina. / No product list found; paste a product page link.");
    for (const u of urls) {
      try {
        const p = await scrapeProduct(u);
        if (p.name) products.push({ id: `url_${products.length}`, name: p.name, description: p.description, price: p.price, oldPrice: p.oldPrice, currency: p.currency, url: p.url, images: p.images, features: p.features, brandName: p.brandName, rating: p.rating });
      } catch {
        /* skip unreadable product */
      }
    }
  }
  return { ...base, platform: "generic", products };
}
