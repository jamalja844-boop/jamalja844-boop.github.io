import { z } from "zod";
import { orgHandler } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { env } from "@/lib/env";
import { ingestAttachment } from "@/lib/cowork/attachments";

/** Upload van een bijlage voor AI Chat (multipart: file, conversationId?). Alleen de tekst wordt bewaard. */
export const POST = orgHandler(
  { permission: "chat.use", rate: { name: "chat-upload", limit: 40, windowSec: 600 } },
  async ({ req, ctx }) => {
    const maxBytes = env().MAX_UPLOAD_MB * 1024 * 1024;
    if (Number(req.headers.get("content-length") ?? 0) > maxBytes + 100_000) throw new ApiError(413, `Bestand is groter dan ${env().MAX_UPLOAD_MB} MB`);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "Geen bestand ontvangen");
    const conversationId = z.string().uuid().nullable().catch(null).parse(form.get("conversationId") || null);
    const filename = file.name.replace(/[^\p{L}\p{N}._ ()-]/gu, "_").slice(0, 200) || "bestand";
    const row = await ingestAttachment(ctx.tenant, { filename, mime: file.type, buf: Buffer.from(await file.arrayBuffer()), conversationId });
    return { attachment: row };
  },
);
