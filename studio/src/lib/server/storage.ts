// File storage: local disk (default) or a private Supabase Storage bucket.
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { config } from "./config";
import { signPath } from "./crypto";

const localPath = (key: string) => {
  const p = path.join(config.storageDir, "files", key);
  if (!p.startsWith(path.join(config.storageDir, "files"))) throw new Error("Invalid storage key");
  return p;
};

const useSupabase = () => !!(config.supabaseUrl && config.supabaseKey);

export async function putFile(key: string, data: Buffer, contentType: string) {
  if (useSupabase()) {
    const r = await fetch(`${config.supabaseUrl}/storage/v1/object/${config.supabaseBucket}/${key}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.supabaseKey}`, "Content-Type": contentType, "x-upsert": "true" },
      body: new Uint8Array(data),
    });
    if (!r.ok) throw new Error(`Supabase upload failed: ${r.status} ${await r.text()}`);
    return;
  }
  const p = localPath(key);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, data);
}

export async function putLocalFile(key: string, filePath: string, contentType: string) {
  if (useSupabase()) return putFile(key, await fs.readFile(filePath), contentType);
  const p = localPath(key);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.copyFile(filePath, p);
}

export async function getFile(key: string): Promise<{ body: ReadableStream | Buffer; size?: number }> {
  if (useSupabase()) {
    const r = await fetch(`${config.supabaseUrl}/storage/v1/object/${config.supabaseBucket}/${key}`, { headers: { Authorization: `Bearer ${config.supabaseKey}` } });
    if (!r.ok || !r.body) throw new Error("File not found");
    return { body: r.body, size: Number(r.headers.get("content-length")) || undefined };
  }
  const p = localPath(key);
  const st = await fs.stat(p);
  const nodeStream = createReadStream(p);
  const body = new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk) => controller.enqueue(chunk));
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (e) => controller.error(e));
    },
    cancel() {
      nodeStream.destroy();
    },
  });
  return { body, size: st.size };
}

export async function readFileBuffer(key: string): Promise<Buffer> {
  if (useSupabase()) {
    const r = await fetch(`${config.supabaseUrl}/storage/v1/object/${config.supabaseBucket}/${key}`, { headers: { Authorization: `Bearer ${config.supabaseKey}` } });
    if (!r.ok) throw new Error("File not found");
    return Buffer.from(await r.arrayBuffer());
  }
  return fs.readFile(localPath(key));
}

export async function deleteFile(key: string) {
  if (useSupabase()) {
    await fetch(`${config.supabaseUrl}/storage/v1/object/${config.supabaseBucket}/${key}`, { method: "DELETE", headers: { Authorization: `Bearer ${config.supabaseKey}` } });
    return;
  }
  await fs.rm(localPath(key), { force: true });
}

/** Absolute, time-limited URL for a media asset (used by the headless renderer). */
export function signedAssetUrl(assetId: string, ttlMs = 6 * 3600_000) {
  const exp = Date.now() + ttlMs;
  return `${config.appUrl}/api/files/${assetId}?exp=${exp}&sig=${signPath(assetId, exp)}`;
}
