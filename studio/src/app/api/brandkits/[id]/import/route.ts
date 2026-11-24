import { z } from "zod";
import { db } from "@/lib/server/db";
import { HttpError, requireUser } from "@/lib/server/auth";
import { handler } from "@/lib/server/http";
import { importCatalog } from "@/lib/server/commerce";
import { scrapeProduct } from "@/lib/server/scrape";
import { importRemoteImage } from "@/lib/server/media";
import type { BrandKitData, ProductEntry } from "@/lib/models";

export const POST = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const u = await requireUser();
  const row = await db.getOwned<BrandKitData>("brandkits", (await params).id, u.id);
  if (!row) throw new HttpError(404, "Brand kit not found");
  const b = z.object({ platform: z.enum(["shopify", "woocommerce", "website"]), url: z.string().url().optional(), limit: z.number().int().min(1).max(50).default(20), rights: z.boolean().optional() }).parse(await req.json());
  let items: ProductEntry[];
  if (b.platform === "website") {
    if (!b.url) throw new HttpError(400, "URL required");
    if (!b.rights) throw new HttpError(400, "Confirm image rights");
    const s = await scrapeProduct(b.url);
    const imgs: string[] = [];
    for (const im of s.images.slice(0, 4)) {
      try { imgs.push((await importRemoteImage(u.id, im, { brandKitId: row.id, rightsNote: `From ${s.url}` })).id); } catch { /* skip */ }
    }
    items = [{ id: `p_${Date.now().toString(36)}`, source: "website", name: s.name, description: s.description, price: s.price, oldPrice: s.oldPrice, currency: s.currency, url: s.url, imageAssetIds: imgs, features: s.features }];
  } else {
    items = await importCatalog(u.id, b.platform, row.id, b.limit);
  }
  const byExt = new Map(row.data.products.map((p) => [p.externalId ?? p.id, p]));
  for (const it of items) byExt.set(it.externalId ?? it.id, { ...byExt.get(it.externalId ?? it.id), ...it });
  await db.update("brandkits", row, { ...row.data, products: [...byExt.values()] });
  return { imported: items.length };
});
