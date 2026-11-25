import { z } from "zod";
import { requireUser, rateLimit } from "@/lib/server/auth";
import { handler } from "@/lib/server/http";
import { scanShop } from "@/lib/server/shop";

export const POST = handler(async (req: Request) => {
  const u = await requireUser();
  rateLimit(`shopscan:${u.id}`, 20, 60_000);
  const b = z.object({ url: z.string().url(), limit: z.number().int().min(1).max(100).default(24) }).parse(await req.json());
  return scanShop(b.url, b.limit);
});
