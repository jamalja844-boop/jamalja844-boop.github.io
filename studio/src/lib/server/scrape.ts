// Extracts product + brand information from a public web page.
// Sources (in order of trust): Shopify/WooCommerce public product JSON, schema.org JSON-LD,
// OpenGraph/Twitter meta tags, plain HTML. robots.txt is respected.
import * as cheerio from "cheerio";
import { normalizeColor, saturation, luminance } from "../engine/color";
import { assertPublicUrl, robotsAllows, safeFetch } from "./safeFetch";

export interface ScrapeResult {
  url: string;
  platform: "shopify" | "woocommerce" | "generic";
  title: string;
  name: string;
  brandName: string;
  description: string;
  price?: string;
  oldPrice?: string;
  currency?: string;
  images: string[];
  logo?: string;
  colors: string[];
  fonts: string[];
  features: string[];
  rating?: { value: number; count: number };
  siteName: string;
  sources: string[];
  warnings: string[];
}

const CURRENCY_SYMBOL: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", JPY: "¥", AED: "AED ", SAR: "SAR ", CHF: "CHF ", MAD: "MAD " };
const sym = (c?: string) => (c ? CURRENCY_SYMBOL[c.toUpperCase()] ?? `${c.toUpperCase()} ` : undefined);
const clean = (s?: string | null) => (s ?? "").replace(/\s+/g, " ").trim();
const stripHtml = (h: string) => clean(cheerio.load(`<div>${h}</div>`)("div").text());
const fmtPrice = (p: unknown) => {
  const n = Number(String(p).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
};

function abs(base: string, u?: string | null) {
  if (!u) return undefined;
  try {
    const x = new URL(u.trim(), base);
    return ["http:", "https:"].includes(x.protocol) ? x.toString() : undefined;
  } catch {
    return undefined;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

function findJsonLd($: cheerio.CheerioAPI): Any[] {
  const out: Any[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const j = JSON.parse($(el).contents().text());
      const walk = (n: Any) => {
        if (!n) return;
        if (Array.isArray(n)) return n.forEach(walk);
        if (typeof n === "object") {
          out.push(n);
          if (n["@graph"]) walk(n["@graph"]);
        }
      };
      walk(j);
    } catch {
      /* ignore invalid JSON-LD */
    }
  });
  return out;
}
const isType = (n: Any, t: string) => [].concat(n?.["@type"] ?? []).some((x: string) => String(x).toLowerCase() === t.toLowerCase());

export async function scrapeProduct(rawUrl: string): Promise<ScrapeResult> {
  const target = await assertPublicUrl(rawUrl);
  if (!(await robotsAllows(target))) throw new Error("This page disallows automated access in robots.txt. Upload the product images and text manually instead.");
  const page = await safeFetch(target.toString(), { accept: "text/html,application/xhtml+xml", maxBytes: 6 * 1024 * 1024 });
  if (page.status >= 400) throw new Error(`The page returned HTTP ${page.status}`);
  const html = page.body.toString("utf8");
  const $ = cheerio.load(html);
  const base = page.url;
  const sources: string[] = [];
  const warnings: string[] = [];
  const meta = (k: string) => clean($(`meta[property="${k}"]`).attr("content") || $(`meta[name="${k}"]`).attr("content"));

  const res: ScrapeResult = {
    url: page.url,
    platform: "generic",
    title: clean($("title").first().text()),
    name: "",
    brandName: meta("og:site_name") || "",
    description: meta("og:description") || meta("description") || meta("twitter:description"),
    images: [],
    colors: [],
    fonts: [],
    features: [],
    siteName: meta("og:site_name") || target.hostname.replace(/^www\./, ""),
    sources,
    warnings,
  };
  const images = new Set<string>();
  const addImg = (u?: string) => {
    const a = abs(base, u);
    if (a && !/\.svg(\?|$)/i.test(a) && !/sprite|placeholder|pixel|spacer|1x1/i.test(a)) images.add(a);
  };

  // ---- Shopify public product JSON
  const isShopify = /cdn\.shopify\.com|Shopify\.theme|shopify-section/i.test(html);
  if (isShopify && /\/products\//.test(target.pathname)) {
    res.platform = "shopify";
    try {
      const j = await safeFetch(`${target.origin}${target.pathname.replace(/\/$/, "")}.json`, { accept: "application/json", maxBytes: 3 * 1024 * 1024 });
      const p = JSON.parse(j.body.toString("utf8")).product;
      if (p) {
        res.name = p.title;
        res.brandName = p.vendor || res.brandName;
        res.description = stripHtml(p.body_html || "") || res.description;
        const v = p.variants?.[0];
        res.price = fmtPrice(v?.price);
        if (v?.compare_at_price && Number(v.compare_at_price) > Number(v.price)) res.oldPrice = fmtPrice(v.compare_at_price);
        (p.images ?? []).forEach((im: Any) => addImg(im.src));
        const $d = cheerio.load(p.body_html || "");
        $d("li").each((_, li) => { const t = clean($d(li).text()); if (t.length > 3 && t.length < 90) res.features.push(t); });
        sources.push("Shopify public product JSON");
      }
    } catch {
      warnings.push("Shopify product JSON not available; fell back to page metadata.");
    }
  }

  // ---- WooCommerce Store API (public)
  const isWoo = /woocommerce/i.test(html);
  if (!res.name && isWoo) {
    res.platform = "woocommerce";
    const slug = target.pathname.split("/").filter(Boolean).pop();
    if (slug) {
      try {
        const j = await safeFetch(`${target.origin}/wp-json/wc/store/v1/products?slug=${encodeURIComponent(slug)}`, { accept: "application/json", maxBytes: 3 * 1024 * 1024 });
        const p = JSON.parse(j.body.toString("utf8"))?.[0];
        if (p) {
          res.name = stripHtml(p.name);
          res.description = stripHtml(p.short_description || p.description || "") || res.description;
          const minor = Number(p.prices?.currency_minor_unit ?? 2);
          const toP = (v: string) => fmtPrice(Number(v) / Math.pow(10, minor));
          res.price = toP(p.prices?.price);
          if (p.prices?.regular_price && p.prices.regular_price !== p.prices.price) res.oldPrice = toP(p.prices.regular_price);
          res.currency = p.prices?.currency_code;
          (p.images ?? []).forEach((im: Any) => addImg(im.src));
          if (p.average_rating && p.review_count) res.rating = { value: Number(p.average_rating), count: Number(p.review_count) };
          sources.push("WooCommerce Store API");
        }
      } catch {
        warnings.push("WooCommerce Store API not reachable; fell back to page metadata.");
      }
    }
  }

  // ---- JSON-LD
  const ld = findJsonLd($);
  const product = ld.find((n) => isType(n, "Product"));
  if (product) {
    sources.push("schema.org Product (JSON-LD)");
    res.name ||= clean(product.name);
    res.description ||= clean(typeof product.description === "string" ? stripHtml(product.description) : "");
    const brand = typeof product.brand === "string" ? product.brand : product.brand?.name;
    if (brand) res.brandName = clean(brand);
    [].concat(product.image ?? []).forEach((im: Any) => addImg(typeof im === "string" ? im : im?.url || im?.contentUrl));
    const offer = [].concat(product.offers ?? []).map((o: Any) => (isType(o, "AggregateOffer") ? { ...o, price: o.lowPrice ?? o.price } : o))[0] as Any;
    if (offer && !res.price) {
      res.price = fmtPrice(offer.price ?? offer.priceSpecification?.price);
      res.currency = offer.priceCurrency ?? offer.priceSpecification?.priceCurrency;
    }
    const ar = product.aggregateRating;
    if (ar && Number(ar.ratingValue) && Number(ar.reviewCount || ar.ratingCount)) res.rating = { value: Number(ar.ratingValue), count: Number(ar.reviewCount || ar.ratingCount) };
  }
  const org = ld.find((n) => isType(n, "Organization") || isType(n, "Brand") || isType(n, "Store"));
  if (org?.logo) res.logo = abs(base, typeof org.logo === "string" ? org.logo : org.logo.url);
  if (org?.name && !res.brandName) res.brandName = clean(org.name);

  // ---- Meta tags
  res.name ||= meta("og:title") || meta("twitter:title") || res.title.split(/[|–—-]/)[0].trim();
  addImg(meta("og:image") || meta("og:image:url"));
  addImg(meta("twitter:image"));
  if (!res.price) {
    res.price = fmtPrice(meta("product:price:amount") || meta("og:price:amount"));
    res.currency ||= meta("product:price:currency") || meta("og:price:currency") || undefined;
  }
  if (meta("og:title")) sources.push("OpenGraph meta tags");

  // ---- HTML images (large product imagery)
  $("img").each((_, el) => {
    if (images.size >= 14) return;
    const $el = $(el);
    const src = $el.attr("data-src") || $el.attr("data-zoom-image") || $el.attr("data-large_image") || $el.attr("src") || $el.attr("srcset")?.split(",").pop()?.trim().split(" ")[0];
    const w = Number($el.attr("width") || 0);
    const alt = ($el.attr("alt") || "").toLowerCase();
    const cls = ($el.attr("class") || "").toLowerCase();
    if (/logo/.test(cls + alt + (src ?? "")) && !res.logo) {
      res.logo = abs(base, src);
      return;
    }
    if (/icon|avatar|badge|payment|flag|logo/.test(cls + alt)) return;
    if (w && w < 200) return;
    if (/product|gallery|main|hero|featured|zoom/.test(cls) || (res.name && alt.includes(res.name.toLowerCase().slice(0, 12)))) addImg(src);
  });
  if (!res.logo) res.logo = abs(base, $('link[rel="apple-touch-icon"]').attr("href") || $('link[rel~="icon"]').last().attr("href"));

  // ---- Features (bullet lists near description)
  if (!res.features.length) {
    $('[class*="description"] li, [id*="description"] li, [class*="feature"] li, [class*="benefit"] li').each((_, li) => {
      const t = clean($(li).text());
      if (t.length > 3 && t.length < 90 && res.features.length < 6) res.features.push(t);
    });
  }

  // ---- Brand colors from markup/CSS (theme-color + frequency of saturated colors)
  const counts = new Map<string, number>();
  const bump = (c: string | null, w = 1) => { if (c) counts.set(c, (counts.get(c) ?? 0) + w); };
  bump(normalizeColor(meta("theme-color")), 50);
  bump(normalizeColor(meta("msapplication-TileColor")), 20);
  const css = $("style").map((_, el) => $(el).text()).get().join("\n") + "\n" + $("[style]").map((_, el) => $(el).attr("style")).get().join("\n");
  for (const m of css.matchAll(/(--[\w-]*(?:primary|brand|accent|main|color)[\w-]*)\s*:\s*(#[0-9a-f]{3,6}\b|rgba?\([^)]+\))/gi)) bump(normalizeColor(m[2]), 15);
  for (const m of css.matchAll(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi)) bump(normalizeColor(m[0]));
  res.colors = [...counts.entries()]
    .filter(([c]) => saturation(c) > 0.25 && luminance(c) > 0.02 && luminance(c) < 0.9)
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => c)
    .slice(0, 6);

  // ---- Fonts
  const fonts = new Set<string>();
  $('link[href*="fonts.googleapis.com"]').each((_, el) => {
    const href = $(el).attr("href") || "";
    for (const m of href.matchAll(/family=([^:&]+)/g)) fonts.add(decodeURIComponent(m[1]).replace(/\+/g, " "));
  });
  for (const m of css.matchAll(/font-family\s*:\s*["']?([A-Za-z0-9 ]{3,30})["']?/g)) {
    const f = m[1].trim();
    if (!/^(inherit|initial|sans-serif|serif|monospace|system-ui|arial|helvetica|var)$/i.test(f)) fonts.add(f);
  }
  res.fonts = [...fonts].filter((f) => /^[A-Za-z0-9 ]{1,40}$/.test(f)).slice(0, 4);

  res.images = [...images].slice(0, 12);
  res.currency = res.currency ? sym(res.currency) : res.price ? "€" : undefined;
  res.brandName ||= res.siteName;
  if (!res.images.length) warnings.push("No product images found. Upload images in the Media Library.");
  if (!res.price) warnings.push("No price found on the page.");
  return res;
}
