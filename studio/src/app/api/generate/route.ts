import { z } from "zod";
import { requireUser, rateLimit } from "@/lib/server/auth";
import { handler } from "@/lib/server/http";
import { createGenerateJob } from "@/lib/agents/pipeline";
import { AD_STYLES } from "@/lib/engine/styles";

const STYLE_IDS = AD_STYLES.map((s) => s.id) as [string, ...string[]];
const Body = z.object({
  source: z.enum(["url", "product", "image", "text"]),
  url: z.string().url().optional(),
  prompt: z.string().max(4000).optional(),
  assetIds: z.array(z.string()).max(20).optional(),
  productId: z.string().optional(),
  brandKitId: z.string().optional(),
  styles: z.array(z.enum(STYLE_IDS)).min(1).max(6),
  variants: z.number().int().min(1).max(6),
  seconds: z.union([z.literal(6), z.literal(10), z.literal(15), z.literal(30), z.literal(60)]),
  aspects: z.array(z.enum(["9:16", "16:9", "1:1", "4:5"])).min(1).max(4),
  language: z.enum(["nl", "en", "ar", "fr", "de", "es"]),
  llmProvider: z.string(),
  ttsProvider: z.string(),
  voice: z.string().max(100).optional(),
  musicAssetId: z.string().optional(),
  captions: z.boolean(),
  productPhoto: z.enum(["none", "studio", "openai"]),
  rightsConfirmed: z.boolean(),
});

export const POST = handler(async (req: Request) => {
  const u = await requireUser();
  rateLimit(`gen:${u.id}`, 20, 3600_000);
  const b = Body.parse(await req.json());
  if (b.source === "url" && !b.url) throw new Error("URL is required");
  const job = await createGenerateJob(u.id, b as never);
  return { jobId: job.id };
});
