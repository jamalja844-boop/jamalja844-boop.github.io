import { z } from "zod";
import { requireUser, rateLimit } from "@/lib/server/auth";
import { handler } from "@/lib/server/http";
import { scrapeProduct } from "@/lib/server/scrape";

export const POST = handler(async (req: Request) => {
  const u = await requireUser();
  rateLimit(`scrape:${u.id}`, 30, 60_000);
  const { url } = z.object({ url: z.string().url() }).parse(await req.json());
  return scrapeProduct(url);
});
