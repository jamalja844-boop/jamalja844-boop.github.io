// Scheduled social posts: captions, scheduling (incl. automatic time slots) and the
// publisher loop that the render worker runs every few seconds.
import * as z from "zod/v4";
import { db, type Row } from "../server/db";
import { readFileBuffer, signedAssetUrl } from "../server/storage";
import type { MediaData } from "../server/media";
import type { ProjectData, RenderData } from "../models";
import type { Clip, ProjectDoc } from "../../remotion/types";
import { generateJson } from "../providers/llm";
import { PLATFORMS, publish, type Platform } from "./publishers";

export type PostStatus = "scheduled" | "publishing" | "published" | "partial" | "failed" | "cancelled";

export interface PostData {
  videoAssetId: string;
  projectId?: string;
  title: string;
  caption: string;
  hashtags: string[];
  platforms: Platform[];
  scheduledAt: string; // ISO UTC
  status: PostStatus;
  attempts: number;
  results: Record<string, { status: "pending" | "published" | "failed"; id?: string; url?: string; error?: string; note?: string; via?: string }>;
  source: "app" | "mcp";
  log: string[];
}

export interface VideoInfo {
  assetId: string;
  renderId?: string;
  projectId?: string;
  name: string;
  productName?: string;
  aspect?: string;
  seconds?: number;
  doc?: ProjectDoc;
}

/** Accepts a render id or a media id of a finished video. */
export async function resolveVideo(owner: string, id: string): Promise<VideoInfo> {
  if (id.startsWith("ren_")) {
    const r = await db.getOwned<RenderData>("renders", id, owner);
    if (!r) throw new Error("Video not found");
    if (r.data.status !== "done" || !r.data.outputAssetId) throw new Error(`Video is not ready yet (status: ${r.data.status})`);
    return { assetId: r.data.outputAssetId, renderId: r.id, projectId: r.data.projectId, name: r.data.projectName, productName: r.data.doc.meta?.productName, aspect: r.data.doc.aspect, seconds: r.data.doc.durationInFrames / r.data.doc.fps, doc: r.data.doc };
  }
  const m = await db.getOwned<MediaData>("media", id, owner);
  if (!m || (m.data.kind !== "render" && m.data.kind !== "video")) throw new Error("Video not found");
  const render = (await db.list<RenderData>("renders", owner)).find((r) => r.data.outputAssetId === id);
  return { assetId: id, renderId: render?.id, projectId: render?.data.projectId, name: m.data.name, productName: render?.data.doc.meta?.productName, aspect: render?.data.doc.aspect, seconds: m.data.duration, doc: render?.data.doc };
}

export async function listVideos(owner: string, limit = 50) {
  const renders = (await db.list<RenderData>("renders", owner)).filter((r) => r.data.status === "done" && r.data.outputAssetId).slice(0, limit);
  const posts = await db.list<PostData>("posts", owner);
  return renders.map((r) => ({
    video_id: r.id,
    name: r.data.projectName,
    product: r.data.doc.meta?.productName,
    aspect: r.data.doc.aspect,
    seconds: r.data.doc.durationInFrames / r.data.doc.fps,
    resolution: r.data.resolution,
    created_at: r.created_at,
    download_url: signedAssetUrl(r.data.outputAssetId!, 24 * 3600_000),
    scheduled_posts: posts.filter((p) => p.data.videoAssetId === r.data.outputAssetId && p.data.status !== "cancelled").map((p) => ({ post_id: p.id, at: p.data.scheduledAt, status: p.data.status, platforms: p.data.platforms })),
  }));
}

/* -------------------------------- captions ------------------------------- */
const TAGS: Record<string, string[]> = {
  nl: ["aanbieding", "shoppen", "nieuw"], en: ["shopping", "musthave", "new"], de: ["angebot", "shopping", "neu"],
  fr: ["shopping", "nouveaute", "bonplan"], es: ["oferta", "compras", "novedad"], ar: ["تسوق", "عروض", "جديد"],
};
const CTA_LINE: Record<string, string> = { nl: "Bestel nu", en: "Shop now", de: "Jetzt bestellen", fr: "Commandez maintenant", es: "Compra ahora", ar: "اطلب الآن" };

function adFacts(doc?: ProjectDoc) {
  const clips = doc?.tracks.flatMap((t) => t.clips) ?? [];
  const price = clips.find((c): c is Extract<Clip, { type: "price" }> => c.type === "price")?.props;
  const button = clips.find((c): c is Extract<Clip, { type: "button" }> => c.type === "button")?.props.label;
  const texts = clips.filter((c): c is Extract<Clip, { type: "text" }> => c.type === "text").map((c) => c.props.text.replace(/\*\*/g, ""));
  return { product: doc?.meta?.productName ?? "", hook: (doc?.meta?.hook ?? "").replace(/\*\*/g, ""), url: doc?.meta?.source, price: price ? `${price.currency}${price.price}` : undefined, oldPrice: price?.oldPrice ? `${price.currency}${price.oldPrice}` : undefined, cta: button, texts: texts.slice(0, 8) };
}

export async function suggestCaption(owner: string, videoId: string, opts: { platform?: Platform; language?: string; llmProvider?: string }) {
  const v = await resolveVideo(owner, videoId);
  const f = adFacts(v.doc);
  const lang = opts.language ?? v.doc?.language ?? "nl";
  if (opts.llmProvider && opts.llmProvider !== "none") {
    const r = await generateJson(owner, opts.llmProvider, "You write social media captions for short product videos. Use only facts given; never invent prices, discounts, reviews or claims. Max 2 emojis.", `Platform: ${opts.platform ?? "all"}. Language code: ${lang}. Write a caption (max 300 characters, hook first, include the link if given) and 5-8 relevant hashtags without #.\nFACTS: ${JSON.stringify(f)}`, z.object({ title: z.string(), caption: z.string(), hashtags: z.array(z.string()).max(12) }));
    return { ...r.data, engine: "ai" as const, provider: r.provider };
  }
  const name = f.product || v.name;
  const lines = [f.hook || name];
  if (f.price) lines.push(`${name} — ${f.price}${f.oldPrice ? ` (was ${f.oldPrice})` : ""}`);
  lines.push(`${f.cta || CTA_LINE[lang] || CTA_LINE.en} 👉 ${f.url ?? ""}`.trim());
  const words = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9؀-ۿ]+/).filter((w) => w.length > 3).slice(0, 3);
  const hashtags = Array.from(new Set([words.join(""), ...words, ...(TAGS[lang] ?? TAGS.en)])).filter(Boolean).slice(0, 8);
  return { title: name.slice(0, 90), caption: lines.join("\n"), hashtags, engine: "template" as const };
}

/* ------------------------------- scheduling ------------------------------ */
/** Converts a wall-clock time in an IANA time zone to a UTC Date. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  return new Date(guess - (asIfUtc - guess));
}

export const PostInput = z.object({
  video_id: z.string(),
  platforms: z.array(z.enum(PLATFORMS)).min(1),
  caption: z.string().max(5000).optional(),
  hashtags: z.array(z.string().max(60)).max(30).optional(),
  title: z.string().max(200).optional(),
  scheduled_at: z.string().describe('ISO 8601 date-time with offset, e.g. "2026-12-01T18:30:00+01:00", or "now"'),
});

export async function schedulePost(owner: string, input: z.infer<typeof PostInput>, source: "app" | "mcp") {
  const v = await resolveVideo(owner, input.video_id);
  const when = input.scheduled_at === "now" ? new Date() : new Date(input.scheduled_at);
  if (Number.isNaN(when.getTime())) throw new Error("scheduled_at is not a valid date");
  if (when.getTime() < Date.now() - 5 * 60_000) throw new Error("scheduled_at lies in the past");
  let { caption, hashtags, title } = input;
  if (!caption) {
    const s = await suggestCaption(owner, input.video_id, {});
    caption = s.caption;
    hashtags ??= s.hashtags;
    title ??= s.title;
  }
  const row = await db.insert<PostData>("posts", owner, {
    videoAssetId: v.assetId, projectId: v.projectId, title: title ?? v.productName ?? v.name, caption, hashtags: (hashtags ?? []).map((h) => h.replace(/^#/, "")),
    platforms: input.platforms, scheduledAt: when.toISOString(), status: "scheduled", attempts: 0,
    results: Object.fromEntries(input.platforms.map((p) => [p, { status: "pending" as const }])), source, log: [`Scheduled via ${source} ${new Date().toISOString()}`],
  });
  return row;
}

export const AutoInput = z.object({
  video_ids: z.array(z.string()).min(1).max(100),
  platforms: z.array(z.enum(PLATFORMS)).min(1),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("first day, YYYY-MM-DD"),
  times: z.array(z.string().regex(/^\d{2}:\d{2}$/)).min(1).max(6).describe('posting times per day, e.g. ["12:00","19:30"]'),
  timezone: z.string().default("Europe/Amsterdam"),
  language: z.string().optional(),
  llm_provider: z.string().optional(),
});

/** Spreads videos over consecutive time slots (one video per slot). */
export async function autoSchedule(owner: string, input: z.infer<typeof AutoInput>, source: "app" | "mcp") {
  const out: Row<PostData>[] = [];
  let day = 0;
  let slot = 0;
  for (const id of input.video_ids) {
    let when: Date;
    for (;;) {
      const [y, m, d] = input.start_date.split("-").map(Number);
      const date = new Date(Date.UTC(y, m - 1, d + day)).toISOString().slice(0, 10);
      when = zonedToUtc(date, input.times[slot], input.timezone);
      slot++;
      if (slot >= input.times.length) { slot = 0; day++; }
      if (when.getTime() > Date.now() + 60_000) break;
    }
    const cap = await suggestCaption(owner, id, { language: input.language, llmProvider: input.llm_provider });
    out.push(await schedulePost(owner, { video_id: id, platforms: input.platforms, caption: cap.caption, hashtags: cap.hashtags, title: cap.title, scheduled_at: when.toISOString() }, source));
  }
  return out;
}

export async function cancelPost(owner: string, id: string) {
  const p = await db.getOwned<PostData>("posts", id, owner);
  if (!p) throw new Error("Post not found");
  if (p.data.status !== "scheduled" && p.data.status !== "failed") throw new Error(`Cannot cancel a post that is ${p.data.status}`);
  return db.update("posts", p, { ...p.data, status: "cancelled", log: [...p.data.log, `Cancelled ${new Date().toISOString()}`] });
}

/* --------------------------- publisher (worker) -------------------------- */
let busy = false;
export async function runDuePosts() {
  if (busy) return;
  busy = true;
  try {
    const now = Date.now();
    const all = await db.list<PostData>("posts", null);
    // recover posts stuck in "publishing" after a crash
    for (const p of all) if (p.data.status === "publishing" && now - new Date(p.updated_at).getTime() > 20 * 60_000) await db.update("posts", p, { ...p.data, status: "scheduled", log: [...p.data.log, "Recovered after interruption"] });
    const due = all.filter((p) => p.data.status === "scheduled" && new Date(p.data.scheduledAt).getTime() <= now).sort((a, b) => a.data.scheduledAt.localeCompare(b.data.scheduledAt));
    for (const p of due) await publishPost(p);
  } finally {
    busy = false;
  }
}

async function publishPost(row: Row<PostData>) {
  let p = await db.update("posts", row, { ...row.data, status: "publishing", attempts: row.data.attempts + 1, log: [...row.data.log, `Publishing (attempt ${row.data.attempts + 1}) ${new Date().toISOString()}`] });
  const media = await db.get<MediaData>("media", p.data.videoAssetId);
  if (!media) {
    await db.update("posts", p, { ...p.data, status: "failed", log: [...p.data.log, "Video file no longer exists"] });
    return;
  }
  const pending = p.data.platforms.filter((pl) => p.data.results[pl]?.status !== "published");
  const res = await publish(row.owner_id, pending, { video: await readFileBuffer(media.data.key), publicUrl: signedAssetUrl(media.id, 48 * 3600_000), title: p.data.title, caption: p.data.caption, hashtags: p.data.hashtags });
  const results = { ...p.data.results };
  for (const [pl, r] of Object.entries(res)) results[pl] = r instanceof Error ? { status: "failed", error: r.message.slice(0, 500) } : { status: "published", id: r.id, url: r.url, note: r.note, via: r.via };
  const ok = Object.values(results).filter((r) => r.status === "published").length;
  const failed = p.data.platforms.length - ok;
  let status: PostStatus = failed === 0 ? "published" : ok > 0 ? "partial" : "failed";
  let scheduledAt = p.data.scheduledAt;
  const log = [...p.data.log, ...Object.entries(res).map(([pl, r]) => `${pl}: ${r instanceof Error ? `failed — ${r.message.slice(0, 200)}` : `published${r.url ? ` ${r.url}` : ""}`}`)];
  // retry failed platforms up to 3 attempts, 10 minutes apart
  if (failed > 0 && p.data.attempts < 3 && !Object.values(results).some((r) => r.error?.includes("not connected"))) {
    status = "scheduled";
    scheduledAt = new Date(Date.now() + 10 * 60_000).toISOString();
    log.push(`Retrying failed platforms at ${scheduledAt}`);
  }
  p = await db.update("posts", p, { ...p.data, results, status, scheduledAt, log });
}
