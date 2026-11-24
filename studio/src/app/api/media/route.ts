import { db } from "@/lib/server/db";
import { HttpError, requireUser } from "@/lib/server/auth";
import { handler } from "@/lib/server/http";
import { mediaUrl, saveMedia, type MediaData } from "@/lib/server/media";

export const GET = handler(async (req: Request) => {
  const u = await requireUser();
  const kind = new URL(req.url).searchParams.get("kind");
  const rows = await db.list<MediaData>("media", u.id, kind ? { kind } : undefined);
  return rows.map((r) => ({ id: r.id, url: mediaUrl(r.id), createdAt: r.created_at, ...r.data, key: undefined }));
});

export const POST = handler(async (req: Request) => {
  const u = await requireUser();
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "No file");
  if (form.get("rights") !== "true") throw new HttpError(400, "Please confirm you have the rights to use this file");
  const buf = Buffer.from(await file.arrayBuffer());
  const row = await saveMedia(u.id, buf, file.type, {
    name: String(form.get("name") || file.name).slice(0, 200),
    source: "upload",
    rights: { confirmed: true, note: String(form.get("rightsNote") || "").slice(0, 500) || undefined },
    brandKitId: (form.get("brandKitId") as string) || undefined,
    tags: String(form.get("tags") || "").split(",").map((t) => t.trim()).filter(Boolean),
  });
  return { id: row.id, url: mediaUrl(row.id), ...row.data, key: undefined };
});
