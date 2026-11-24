import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { handler } from "@/lib/server/http";
import { mediaUrl, saveMedia } from "@/lib/server/media";
import { synthesize } from "@/lib/providers/tts";

// Generates a voice-over clip (+ word timings) for the editor.
export const POST = handler(async (req: Request) => {
  const u = await requireUser();
  const b = z.object({ provider: z.string(), text: z.string().min(1).max(3000), language: z.string(), voice: z.string().max(100).optional() }).parse(await req.json());
  const r = await synthesize(u.id, b.provider, b.text, b.language, b.voice);
  const m = await saveMedia(u.id, r.audio, r.mime, { name: `VO: ${b.text.slice(0, 40)}`, source: "tts", provider: r.provider, rights: { confirmed: true, note: `Generated with ${r.provider}` } });
  return { assetId: m.id, url: mediaUrl(m.id), duration: r.duration, words: r.words, timing: r.timing, costUsd: r.costUsd };
});
