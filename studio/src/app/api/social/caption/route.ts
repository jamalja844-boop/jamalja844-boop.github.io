import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { handler } from "@/lib/server/http";
import { suggestCaption } from "@/lib/social/posts";
import { PLATFORMS } from "@/lib/social/publishers";

export const POST = handler(async (req: Request) => {
  const u = await requireUser();
  const b = z.object({ video_id: z.string(), platform: z.enum(PLATFORMS).optional(), language: z.string().optional(), llmProvider: z.string().optional() }).parse(await req.json());
  return suggestCaption(u.id, b.video_id, { platform: b.platform, language: b.language, llmProvider: b.llmProvider });
});
