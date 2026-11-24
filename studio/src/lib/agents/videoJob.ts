// AI Video Generator jobs (Runway / Google Veo / Kling). The external task is polled
// whenever the client polls the job; finished videos are saved into the media library.
import sharp from "sharp";
import { db, type Row } from "../server/db";
import { saveMedia, type MediaData } from "../server/media";
import { readFileBuffer } from "../server/storage";
import { pollVideo, startVideo } from "../providers/video";
import type { JobData } from "../models";

export interface VideoJobInput {
  provider: string;
  prompt: string;
  imageAssetId?: string;
  aspect: "16:9" | "9:16" | "1:1";
  seconds: number;
}

export async function createVideoJob(owner: string, input: VideoJobInput) {
  let image;
  if (input.imageAssetId) {
    const a = await db.getOwned<MediaData>("media", input.imageAssetId, owner);
    if (!a) throw new Error("Image not found");
    const buf = await sharp(await readFileBuffer(a.data.key)).resize(1280, 1280, { fit: "inside" }).jpeg({ quality: 90 }).toBuffer();
    image = { base64: buf.toString("base64"), mime: "image/jpeg", dataUri: `data:image/jpeg;base64,${buf.toString("base64")}` };
  }
  const taskId = await startVideo(owner, input.provider, { prompt: input.prompt, image, aspect: input.aspect, seconds: input.seconds });
  return db.insert<JobData>("jobs", owner, {
    type: "aivideo", status: "running", input, heartbeat: new Date().toISOString(), external: { provider: input.provider, taskId },
    steps: [{ agent: "video-editor", status: "running", engine: "ai", provider: input.provider, message: "Generating video", startedAt: new Date().toISOString() }],
  });
}

export async function advanceVideoJob(row: Row<JobData>): Promise<Row<JobData>> {
  if (!row.data.external) return row;
  // throttle provider polling
  if (Date.now() - new Date(row.updated_at).getTime() < 4000) return row;
  const { provider, taskId } = row.data.external;
  try {
    const p = await pollVideo(row.owner_id, provider, taskId);
    if (p.status === "succeeded" && p.url) {
      const r = await fetch(p.url, { headers: p.downloadHeaders, signal: AbortSignal.timeout(120000) });
      if (!r.ok) throw new Error(`Download failed (${r.status})`);
      const buf = Buffer.from(await r.arrayBuffer());
      const input = row.data.input as VideoJobInput;
      const m = await saveMedia(row.owner_id, buf, "video/mp4", { name: `AI video: ${input.prompt.slice(0, 40)}`, source: "ai", provider, rights: { confirmed: true, note: `Generated with ${provider}` } });
      return db.update("jobs", row, { ...row.data, status: "done", result: { assetId: m.id }, steps: [{ ...row.data.steps[0], status: "done", message: "Video saved to media library", finishedAt: new Date().toISOString() }] });
    }
    if (p.status === "failed") return db.update("jobs", row, { ...row.data, status: "failed", error: p.error, steps: [{ ...row.data.steps[0], status: "failed", message: p.error }] });
    return db.update("jobs", row, { ...row.data, heartbeat: new Date().toISOString(), steps: [{ ...row.data.steps[0], message: `Provider status: ${p.status}` }] });
  } catch (e) {
    return db.update("jobs", row, { ...row.data, status: "failed", error: e instanceof Error ? e.message : String(e) });
  }
}
