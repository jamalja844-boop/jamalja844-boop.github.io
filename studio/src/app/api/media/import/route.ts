import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { handler } from "@/lib/server/http";
import { importRemoteImage, mediaUrl } from "@/lib/server/media";

export const POST = handler(async (req: Request) => {
  const u = await requireUser();
  const b = z.object({ urls: z.array(z.string().url()).min(1).max(20), rights: z.literal(true), brandKitId: z.string().optional() }).parse(await req.json());
  const out = [];
  for (const url of b.urls) {
    try {
      const r = await importRemoteImage(u.id, url, { brandKitId: b.brandKitId, rightsNote: `Imported from ${url}; rights confirmed by user` });
      out.push({ id: r.id, url: mediaUrl(r.id), ok: true });
    } catch (e) {
      out.push({ url, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
});
