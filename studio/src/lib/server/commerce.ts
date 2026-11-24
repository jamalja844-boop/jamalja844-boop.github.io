// Product catalogue import through the official Shopify Admin GraphQL API and WooCommerce REST API.
import { getCredentials } from "./secrets";
import { assertPublicUrl } from "./safeFetch";
import { importRemoteImage } from "./media";
import type { ProductEntry } from "../models";

const strip = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const SYM: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" };

export async function importCatalog(owner: string, platform: "shopify" | "woocommerce", brandKitId: string, limit = 20): Promise<ProductEntry[]> {
  const c = await getCredentials(owner, platform);
  if (!c) throw new Error(`${platform === "shopify" ? "Shopify" : "WooCommerce"} is not configured in AI Settings → Integrations`);
  const out: ProductEntry[] = [];
  if (platform === "shopify") {
    const domain = (c.settings.shopDomain || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!/^[a-z0-9-]+\.myshopify\.com$/i.test(domain)) throw new Error("Shop domain must look like your-store.myshopify.com");
    const q = `query($n:Int!){ shop { currencyCode } products(first:$n, sortKey:UPDATED_AT, reverse:true){ nodes { id title handle description onlineStoreUrl images(first:4){ nodes { url } } variants(first:1){ nodes { price compareAtPrice } } } } }`;
    const r = await fetch(`https://${domain}/admin/api/${c.settings.apiVersion || "2025-07"}/graphql.json`, { method: "POST", headers: { "X-Shopify-Access-Token": c.values.token, "Content-Type": "application/json" }, body: JSON.stringify({ query: q, variables: { n: limit } }) });
    const j = await r.json();
    if (!r.ok || j.errors) throw new Error(`Shopify: ${JSON.stringify(j.errors ?? r.status).slice(0, 300)}`);
    const cur = SYM[j.data.shop.currencyCode] ?? `${j.data.shop.currencyCode} `;
    for (const p of j.data.products.nodes) {
      const v = p.variants.nodes[0];
      const imgs = [];
      for (const im of p.images.nodes) {
        try { imgs.push((await importRemoteImage(owner, im.url, { brandKitId, rightsNote: "Imported from own Shopify store" })).id); } catch { /* skip */ }
      }
      out.push({ id: `p_${p.id.split("/").pop()}`, externalId: p.id, source: "shopify", name: p.title, description: p.description, price: v?.price, oldPrice: v?.compareAtPrice && Number(v.compareAtPrice) > Number(v.price) ? v.compareAtPrice : undefined, currency: cur, url: p.onlineStoreUrl ?? `https://${domain}/products/${p.handle}`, imageAssetIds: imgs, features: [] });
    }
  } else {
    const site = (await assertPublicUrl(c.settings.siteUrl)).origin;
    const auth = Buffer.from(`${c.values.consumerKey}:${c.values.consumerSecret}`).toString("base64");
    const r = await fetch(`${site}/wp-json/wc/v3/products?per_page=${limit}&status=publish`, { headers: { Authorization: `Basic ${auth}` }, redirect: "error" });
    if (!r.ok) throw new Error(`WooCommerce ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const list = await r.json();
    for (const p of list) {
      const imgs = [];
      for (const im of (p.images ?? []).slice(0, 4)) {
        try { imgs.push((await importRemoteImage(owner, im.src, { brandKitId, rightsNote: "Imported from own WooCommerce store" })).id); } catch { /* skip */ }
      }
      out.push({ id: `p_wc${p.id}`, externalId: String(p.id), source: "woocommerce", name: p.name, description: strip(p.short_description || p.description || ""), price: p.sale_price || p.price, oldPrice: p.sale_price ? p.regular_price : undefined, currency: "€", url: p.permalink, imageAssetIds: imgs, features: [] });
    }
  }
  return out;
}
