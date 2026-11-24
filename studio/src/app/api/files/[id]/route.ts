import { db } from "@/lib/server/db";
import { currentUser } from "@/lib/server/auth";
import { verifySignedPath } from "@/lib/server/crypto";
import { getFile, readFileBuffer } from "@/lib/server/storage";
import type { MediaData } from "@/lib/server/media";

// Serves media to its owner (session) or to the renderer (signed, expiring URL). Supports Range.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const row = await db.get<MediaData>("media", id);
  if (!row) return new Response("Not found", { status: 404 });
  const signed = verifySignedPath(id, url.searchParams.get("exp"), url.searchParams.get("sig"));
  if (!signed) {
    const u = await currentUser();
    if (!u || u.id !== row.owner_id) return new Response("Not found", { status: 404 });
  }
  const headers: Record<string, string> = {
    "Content-Type": row.data.mime,
    "Cache-Control": "private, max-age=3600",
    "Accept-Ranges": "bytes",
    "Access-Control-Allow-Origin": signed ? "*" : url.origin,
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  };
  if (url.searchParams.get("download")) headers["Content-Disposition"] = `attachment; filename="${row.data.name.replace(/[^\w.\- ()]/g, "_")}"`;
  const range = req.headers.get("range");
  if (range && (row.data.kind === "video" || row.data.kind === "audio" || row.data.kind === "render")) {
    const buf = await readFileBuffer(row.data.key);
    const m = range.match(/bytes=(\d*)-(\d*)/);
    const start = m?.[1] ? parseInt(m[1]) : 0;
    const end = m?.[2] ? Math.min(parseInt(m[2]), buf.length - 1) : buf.length - 1;
    if (start >= buf.length) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${buf.length}` } });
    return new Response(new Uint8Array(buf.subarray(start, end + 1)), { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${buf.length}`, "Content-Length": String(end - start + 1) } });
  }
  const f = await getFile(row.data.key);
  if (f.size) headers["Content-Length"] = String(f.size);
  return new Response(Buffer.isBuffer(f.body) ? new Uint8Array(f.body) : (f.body as ReadableStream), { headers });
}
