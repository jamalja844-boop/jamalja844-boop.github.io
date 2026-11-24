import { db } from "@/lib/server/db";
import { HttpError, requireUser } from "@/lib/server/auth";
import { handler } from "@/lib/server/http";
import { deleteFile } from "@/lib/server/storage";
import type { MediaData } from "@/lib/server/media";

export const DELETE = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const u = await requireUser();
  const { id } = await params;
  const row = await db.getOwned<MediaData>("media", id, u.id);
  if (!row) throw new HttpError(404, "Not found");
  await deleteFile(row.data.key);
  await db.del("media", id);
  return { ok: true };
});
