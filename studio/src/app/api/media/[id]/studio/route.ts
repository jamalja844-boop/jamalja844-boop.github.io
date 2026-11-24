import { z } from "zod";
import { db } from "@/lib/server/db";
import { HttpError, requireUser } from "@/lib/server/auth";
import { handler } from "@/lib/server/http";
import { mediaUrl, saveMedia, type MediaData } from "@/lib/server/media";
import { readFileBuffer } from "@/lib/server/storage";
import { aiProductScene, studioShot } from "@/lib/providers/image";

// AI Product Photographer on a single asset
export const POST = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const u = await requireUser();
  const { id } = await params;
  const b = z.object({ mode: z.enum(["studio", "openai"]), prompt: z.string().max(1000).optional(), bg1: z.string().optional(), bg2: z.string().optional() }).parse(await req.json());
  const row = await db.getOwned<MediaData>("media", id, u.id);
  if (!row || row.data.kind !== "image") throw new HttpError(404, "Image not found");
  const buf = await readFileBuffer(row.data.key);
  if (b.mode === "studio") {
    const out = await studioShot(buf, { bg1: b.bg1, bg2: b.bg2 });
    const m = await saveMedia(u.id, out, "image/jpeg", { name: `${row.data.name} (studio)`, source: "upload", rights: row.data.rights, brandKitId: row.data.brandKitId });
    return { id: m.id, url: mediaUrl(m.id) };
  }
  const r = await aiProductScene(u.id, buf, b.prompt || "Professional studio product photo on a clean seamless background with soft shadow. Keep the product unchanged.");
  const m = await saveMedia(u.id, r.image, "image/png", { name: `${row.data.name} (AI scene)`, source: "ai", provider: "openai", rights: { confirmed: true, note: "Generated with OpenAI Images" }, brandKitId: row.data.brandKitId });
  return { id: m.id, url: mediaUrl(m.id), costUsd: r.costUsd };
});
