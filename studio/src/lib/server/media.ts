import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { db, newId, type Row } from "./db";
import { putFile } from "./storage";
import { safeFetch } from "./safeFetch";

const exec = promisify(execFile);

export type MediaKind = "image" | "video" | "audio" | "render";

export interface MediaData {
  kind: MediaKind;
  name: string;
  key: string;
  mime: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
  /** dominant colors (images) */
  colors?: string[];
  source: "upload" | "import" | "ai" | "tts" | "render";
  sourceUrl?: string;
  provider?: string;
  /** user declaration that they hold usage rights for this asset */
  rights: { confirmed: boolean; note?: string };
  brandKitId?: string;
  tags?: string[];
}

const ALLOWED: Record<string, MediaKind> = {
  "image/png": "image", "image/jpeg": "image", "image/webp": "image", "image/gif": "image", "image/avif": "image",
  "video/mp4": "video", "video/webm": "video", "video/quicktime": "video",
  "audio/mpeg": "audio", "audio/mp3": "audio", "audio/wav": "audio", "audio/x-wav": "audio", "audio/wave": "audio", "audio/ogg": "audio", "audio/aac": "audio", "audio/mp4": "audio", "audio/x-m4a": "audio", "audio/webm": "audio",
};

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav", "audio/ogg": "ogg", "audio/aac": "aac", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/webm": "weba" };

export async function probeDuration(buf: Buffer, ext: string): Promise<number | undefined> {
  const tmp = path.join(os.tmpdir(), `probe-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
  try {
    await fs.writeFile(tmp, buf);
    const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", tmp]);
    const d = parseFloat(stdout.trim());
    return Number.isFinite(d) ? d : undefined;
  } catch {
    return undefined;
  } finally {
    await fs.rm(tmp, { force: true });
  }
}

export async function dominantColors(buf: Buffer): Promise<string[]> {
  // Downscale + quantise into buckets, ignore near-white/near-black backgrounds.
  const { data, info } = await sharp(buf).resize(64, 64, { fit: "inside" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < info.width * info.height * 3; i += 3) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max > 240 && min > 225) continue;
    if (max < 18) continue;
    const k = `${r >> 5}-${g >> 5}-${b >> 5}`;
    const e = buckets.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    buckets.set(k, e);
  }
  return [...buckets.values()].sort((a, b) => b.n - a.n).slice(0, 5).map((e) => "#" + [e.r / e.n, e.g / e.n, e.b / e.n].map((v) => Math.round(v).toString(16).padStart(2, "0")).join(""));
}

export async function saveMedia(owner: string, buf: Buffer, mimeIn: string, meta: Omit<MediaData, "kind" | "key" | "mime" | "size">): Promise<Row<MediaData>> {
  let mime = mimeIn.split(";")[0].trim().toLowerCase();
  let kind = ALLOWED[mime];
  let data = buf;
  let width: number | undefined, height: number | undefined, colors: string[] | undefined;
  if (!kind || kind === "image") {
    // verify image by decoding it (rejects disguised files); convert exotic formats to PNG/JPEG
    try {
      const md = await sharp(buf, { animated: false }).metadata();
      if (!md.format) throw new Error();
      width = md.width; height = md.height;
      if (!["png", "jpeg", "webp", "gif"].includes(md.format)) {
        data = await sharp(buf).png().toBuffer();
        mime = "image/png";
      } else mime = `image/${md.format}`;
      kind = "image";
      colors = await dominantColors(data).catch(() => undefined);
    } catch {
      if (!kind) throw new Error(`Unsupported file type: ${mimeIn || "unknown"}`);
      throw new Error("File is not a valid image");
    }
  }
  if (data.length > 500 * 1024 * 1024) throw new Error("File too large (max 500 MB)");
  const id = newId("med");
  const key = `${owner}/${id}.${EXT[mime] ?? "bin"}`;
  await putFile(key, data, mime);
  const duration = kind === "audio" || kind === "video" ? await probeDuration(data, EXT[mime] ?? "bin") : undefined;
  return db.insert<MediaData>("media", owner, { ...meta, kind, key, mime, size: data.length, width, height, duration, colors }, id);
}

export async function importRemoteImage(owner: string, url: string, meta: { name?: string; brandKitId?: string; rightsNote?: string }) {
  const r = await safeFetch(url, { maxBytes: 15 * 1024 * 1024, accept: "image/*" });
  if (r.status >= 400) throw new Error(`Image download failed (${r.status})`);
  return saveMedia(owner, r.body, r.contentType || "image/jpeg", {
    name: meta.name ?? decodeURIComponent(new URL(r.url).pathname.split("/").pop() || "image"),
    source: "import",
    sourceUrl: url,
    rights: { confirmed: true, note: meta.rightsNote },
    brandKitId: meta.brandKitId,
  });
}

export const mediaUrl = (id: string) => `/api/files/${id}`;
