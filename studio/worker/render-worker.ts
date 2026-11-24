/* Render worker: Remotion (Chromium) renders frames, FFmpeg encodes H.264 MP4.
   Run with `npm run worker`. Picks up jobs from BullMQ (REDIS_URL) or by polling the DB. */
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition, ensureBrowser } from "@remotion/renderer";
import { config } from "../src/lib/server/config";
import { db, type Row } from "../src/lib/server/db";
import { putLocalFile } from "../src/lib/server/storage";
import { prepareForRender } from "../src/lib/server/renderPrep";
import { QUEUE_NAME } from "../src/lib/server/queue";
import type { MediaData } from "../src/lib/server/media";
import type { RenderData } from "../src/lib/models";

let serveUrl: string | null = null;
let busy = false;

async function getBundle() {
  if (serveUrl) return serveUrl;
  console.log("[worker] bundling Remotion project…");
  serveUrl = await bundle({ entryPoint: path.join(process.cwd(), "src/remotion/index.ts"), outDir: path.join(process.cwd(), ".remotion-bundle") });
  return serveUrl;
}

async function update(row: Row<RenderData>, patch: Partial<RenderData>) {
  const fresh = (await db.get<RenderData>("renders", row.id)) ?? row;
  if (fresh.data.status === "cancelled" && patch.status !== "cancelled") throw new Error("cancelled");
  const next = await db.update("renders", fresh, { ...fresh.data, ...patch });
  Object.assign(row, next);
  return next;
}

async function processRender(id: string) {
  const row = await db.get<RenderData>("renders", id);
  if (!row || !["queued", "rendering"].includes(row.data.status)) return;
  const attempts = row.data.attempts + 1;
  await update(row, { status: "rendering", progress: 0, attempts, startedAt: new Date().toISOString(), error: undefined, log: [...row.data.log, `Attempt ${attempts} started ${new Date().toISOString()}`] });
  const out = path.join(os.tmpdir(), `render-${id}-${Date.now()}.mp4`);
  try {
    const url = await getBundle();
    const inputProps = { project: prepareForRender(row.data.doc) };
    const chromiumOptions = { gl: config.gl, ignoreCertificateErrors: false } as const;
    const browserExecutable = config.browserExecutable || null;
    const composition = await selectComposition({ serveUrl: url, id: "Ad", inputProps, chromiumOptions, browserExecutable });
    let last = 0;
    await renderMedia({
      composition, serveUrl: url, codec: "h264", outputLocation: out, inputProps, chromiumOptions, browserExecutable,
      scale: row.data.resolution === "4k" ? 2 : 1,
      crf: row.data.resolution === "4k" ? 20 : 18,
      pixelFormat: "yuv420p",
      audioCodec: "aac",
      concurrency: Math.max(1, Math.min(4, os.cpus().length - 1)),
      timeoutInMilliseconds: 120000,
      onProgress: async ({ progress, stitchStage }) => {
        if (progress - last >= 0.03 || progress === 1) {
          last = progress;
          await update(row, { progress: Math.round(progress * 100), status: stitchStage === "muxing" ? "encoding" : "rendering" });
        }
      },
    });
    const st = await fs.stat(out);
    const media = await db.insert<MediaData>("media", row.owner_id, {
      kind: "render", name: `${row.data.projectName} (${row.data.doc.aspect}, ${row.data.resolution}).mp4`, key: `${row.owner_id}/render-${id}.mp4`, mime: "video/mp4", size: st.size,
      width: row.data.doc.width * (row.data.resolution === "4k" ? 2 : 1), height: row.data.doc.height * (row.data.resolution === "4k" ? 2 : 1), duration: row.data.doc.durationInFrames / row.data.doc.fps,
      source: "render", rights: { confirmed: true, note: "Rendered by Ad Studio" },
    });
    await putLocalFile(media.data.key, out, "video/mp4");
    await update(row, { status: "done", progress: 100, outputAssetId: media.id, finishedAt: new Date().toISOString(), log: [...row.data.log, `Done: ${(st.size / 1e6).toFixed(1)} MB`] });
    console.log(`[worker] render ${id} done`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "cancelled") return;
    console.error(`[worker] render ${id} failed:`, msg);
    const retry = attempts < row.data.maxAttempts;
    await update(row, { status: retry ? "queued" : "failed", error: msg.slice(0, 2000), log: [...row.data.log, `Attempt ${attempts} failed: ${msg.slice(0, 300)}${retry ? " — will retry" : ""}`] }).catch(() => {});
  } finally {
    await fs.rm(out, { force: true });
  }
}

async function recoverStale() {
  // Renders left in "rendering" by a crashed worker go back to the queue.
  const rows = await db.list<RenderData>("renders", null);
  for (const r of rows) {
    if ((r.data.status === "rendering" || r.data.status === "encoding") && Date.now() - new Date(r.updated_at).getTime() > 3 * 60_000) {
      await db.update("renders", r, { ...r.data, status: "queued", log: [...r.data.log, "Recovered after worker interruption"] });
    }
  }
}

async function pollLoop() {
  for (;;) {
    if (!busy) {
      const next = (await db.list<RenderData>("renders", null, { status: "queued" })).sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
      if (next) {
        busy = true;
        await processRender(next.id).finally(() => (busy = false));
        continue;
      }
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

async function main() {
  console.log("[worker] ensuring browser…");
  if (!config.browserExecutable) await ensureBrowser();
  await getBundle();
  await recoverStale();
  setInterval(() => recoverStale().catch(() => {}), 60_000);
  if (config.redisUrl) {
    const { Worker } = await import("bullmq");
    const IORedis = (await import("ioredis")).default;
    const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
    new Worker(QUEUE_NAME, async (job) => processRender(job.data.renderId), { connection, concurrency: 1 });
    console.log("[worker] listening on BullMQ queue", QUEUE_NAME);
    // also sweep DB for retries scheduled after failures
    setInterval(async () => {
      if (busy) return;
      const q = (await db.list<RenderData>("renders", null, { status: "queued" })).filter((r) => r.data.attempts > 0);
      for (const r of q) { busy = true; await processRender(r.id).finally(() => (busy = false)); }
    }, 10_000);
  } else {
    console.log("[worker] polling database for queued renders (set REDIS_URL to use BullMQ)");
    await pollLoop();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
