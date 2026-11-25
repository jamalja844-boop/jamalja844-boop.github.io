import { z } from "zod";
import { requireUser, rateLimit } from "@/lib/server/auth";
import { handler } from "@/lib/server/http";
import { createShopBatch } from "@/lib/agents/batch";
import { AD_STYLES } from "@/lib/engine/styles";

const Product = z.object({
  id: z.string().max(100), name: z.string().min(1).max(300), description: z.string().max(8000), price: z.string().max(20).optional(), oldPrice: z.string().max(20).optional(),
  currency: z.string().max(8).optional(), url: z.string().url(), images: z.array(z.string().url()).max(10), features: z.array(z.string().max(200)).max(10), brandName: z.string().max(200).optional(),
  rating: z.object({ value: z.number(), count: z.number() }).optional(),
});
const Body = z.object({
  shop: z.object({ shopName: z.string().max(200), logo: z.string().url().optional(), colors: z.array(z.string().regex(/^#[0-9a-f]{6}$/i)).max(8).optional(), fonts: z.array(z.string().regex(/^[A-Za-z0-9 ]{1,40}$/)).max(4).optional() }),
  products: z.array(Product).min(1).max(50),
  options: z.object({
    style: z.enum(["auto", ...AD_STYLES.map((s) => s.id)] as [string, ...string[]]),
    variants: z.number().int().min(1).max(3),
    seconds: z.union([z.literal(6), z.literal(10), z.literal(15), z.literal(30), z.literal(60)]),
    aspects: z.array(z.enum(["9:16", "16:9", "1:1", "4:5"])).min(1).max(4),
    language: z.enum(["nl", "en", "ar", "fr", "de", "es"]),
    llmProvider: z.string(), ttsProvider: z.string(), voice: z.string().max(100).optional(),
    music: z.enum(["auto", "none"]), musicAssetId: z.string().optional(),
    captions: z.boolean(), productPhoto: z.enum(["none", "studio", "openai"]),
    aiClipProvider: z.enum(["runway", "gemini", "kling"]).optional(),
    autoRender: z.enum(["1080p", "4k"]).optional(),
    rightsConfirmed: z.literal(true),
    brandKitId: z.string().optional(),
  }),
});

export const POST = handler(async (req: Request) => {
  const u = await requireUser();
  rateLimit(`shopgen:${u.id}`, 10, 3600_000);
  const b = Body.parse(await req.json());
  const batch = await createShopBatch(u.id, b.shop, b.products, b.options as never);
  return { batchId: batch.id };
});
