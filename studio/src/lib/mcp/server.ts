// MCP server: lets Claude (Code, Desktop, claude.ai) and Codex / ChatGPT drive the studio —
// find webshop products, make videos, write captions and schedule social posts.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { db } from "../server/db";
import { listSecrets } from "../server/secrets";
import { scanShop } from "../server/shop";
import { createShopBatch } from "../agents/batch";
import type { JobData, GenerateInput, RenderData } from "../models";
import { AD_STYLES } from "../engine/styles";
import { AutoInput, PostInput, autoSchedule, cancelPost, listVideos, schedulePost, suggestCaption, type PostData } from "../social/posts";
import { PLATFORMS, routes } from "../social/publishers";

const text = (data: unknown) => ({ content: [{ type: "text" as const, text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] });
const fail = (e: unknown) => ({ isError: true, content: [{ type: "text" as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }] });
const wrap = <A,>(fn: (a: A) => Promise<unknown>) => async (a: A) => {
  try {
    return text(await fn(a));
  } catch (e) {
    return fail(e);
  }
};

async function firstConfigured(owner: string, ids: string[]) {
  const s = await listSecrets(owner);
  return ids.find((id) => s.some((x) => x.provider === id && x.enabled));
}

export function buildMcpServer(owner: string) {
  const server = new McpServer(
    { name: "ai-video-ads-studio", version: "1.0.0" },
    {
      instructions:
        "AI Video Ads Studio. Typical flow: scan_shop(url) -> create_videos(...) -> get_video_job(job_id) until done -> list_videos -> suggest_caption -> schedule_post or auto_schedule. " +
        "Always ask the user to confirm they have the rights to the shop's images before create_videos, and confirm platforms and times before scheduling. Times are ISO 8601 with offset.",
    },
  );

  server.registerTool("scan_shop", {
    title: "Find webshop products",
    description: "Reads a webshop link (home, category/collection or product page) and returns its products with id, name, price and image count. Works with Shopify, WooCommerce and shops with a product sitemap.",
    inputSchema: { url: z.string().url(), limit: z.number().int().min(1).max(100).default(24) },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, wrap(async ({ url, limit }) => {
    const r = await scanShop(url, limit);
    return { shop: r.shopName, platform: r.platform, warnings: r.warnings, products: r.products.map((p) => ({ id: p.id, name: p.name, price: p.price ? `${p.currency ?? ""}${p.price}` : null, old_price: p.oldPrice ?? null, images: p.images.length, url: p.url })) };
  }));

  server.registerTool("create_videos", {
    title: "Make product videos",
    description: "Creates an animated ad video (MP4) for each selected product of a webshop, with generated music, optional voice-over and subtitles. Rendering runs in the background; poll get_video_job.",
    inputSchema: {
      shop_url: z.string().url(),
      product_ids: z.array(z.string()).max(50).optional().describe("ids from scan_shop; omit to use the first `limit` products"),
      limit: z.number().int().min(1).max(50).default(6),
      seconds: z.union([z.literal(6), z.literal(10), z.literal(15), z.literal(30), z.literal(60)]).default(15),
      formats: z.array(z.enum(["9:16", "16:9", "1:1", "4:5"])).min(1).default(["9:16"]),
      language: z.enum(["nl", "en", "ar", "fr", "de", "es"]).default("nl"),
      style: z.enum(["auto", ...AD_STYLES.map((s) => s.id)] as [string, ...string[]]).default("auto"),
      voice_over: z.boolean().default(true).describe("uses the configured ElevenLabs/OpenAI/Google voice; ignored if none is configured"),
      music: z.boolean().default(true),
      resolution: z.enum(["1080p", "4k"]).default("1080p"),
      rights_confirmed: z.literal(true).describe("the user confirmed they may use the shop's images and texts in ads"),
    },
    annotations: { destructiveHint: false, openWorldHint: true },
  }, wrap(async (a) => {
    const scan = await scanShop(a.shop_url, 100);
    const chosen = a.product_ids?.length ? scan.products.filter((p) => a.product_ids!.includes(p.id)) : scan.products.slice(0, a.limit);
    if (!chosen.length) throw new Error("No matching products found; call scan_shop first and pass its product ids");
    const llm = (await firstConfigured(owner, ["anthropic", "openai", "gemini", "xai", "nvidia"])) ?? "none";
    const tts = a.voice_over ? (await firstConfigured(owner, ["elevenlabs", "openai", "google-tts"])) ?? "none" : "none";
    const opts = { style: a.style, variants: 1, seconds: a.seconds, aspects: a.formats, language: a.language, llmProvider: llm, ttsProvider: tts, music: a.music ? "auto" : "none", captions: true, productPhoto: "studio", autoRender: a.resolution, rightsConfirmed: true } as unknown as Parameters<typeof createShopBatch>[3];
    const batch = await createShopBatch(owner, { shopName: scan.shopName, logo: scan.logo, colors: scan.colors.filter((c) => /^#[0-9a-f]{6}$/i.test(c)), fonts: scan.fonts }, chosen, opts);
    return { job_id: batch.id, products: chosen.map((p) => p.name), text_engine: llm === "none" ? "template (no AI key configured)" : llm, voice_over: tts === "none" ? "none (no TTS key configured)" : tts, note: "Videos are produced one product after another; call get_video_job to follow progress." };
  }));

  server.registerTool("get_video_job", {
    title: "Video job status",
    description: "Progress of a create_videos job: per product the status and, when rendered, the video ids that can be posted.",
    inputSchema: { job_id: z.string() },
    annotations: { readOnlyHint: true },
  }, wrap(async ({ job_id }) => {
    const b = await db.getOwned<JobData>("jobs", job_id, owner);
    if (!b) throw new Error("Job not found");
    const items = [];
    for (const cid of b.data.result?.childJobIds ?? []) {
      const c = await db.getOwned<JobData>("jobs", cid, owner);
      if (!c) continue;
      const renders = [];
      for (const rid of c.data.result?.renderIds ?? []) {
        const r = await db.getOwned<RenderData>("renders", rid, owner);
        if (r) renders.push({ video_id: r.id, format: r.data.doc.aspect, status: r.data.status, progress: r.data.progress, error: r.data.error });
      }
      items.push({ product: (c.data.input as GenerateInput).productData?.name, status: c.data.status, error: c.data.error, videos: renders });
    }
    const all = items.flatMap((i) => i.videos);
    const ready = all.filter((v) => v.status === "done").length;
    const status = b.data.status === "done" && ready < all.length && all.some((v) => ["queued", "rendering", "encoding"].includes(v.status)) ? "rendering" : b.data.status;
    return { status, videos_ready: all.filter((v) => v.status === "done").length, videos_total: all.length, items };
  }));

  server.registerTool("list_videos", {
    title: "List finished videos",
    description: "Finished MP4 videos with video_id, product, format, a 24-hour download link and existing scheduled posts.",
    inputSchema: { limit: z.number().int().min(1).max(200).default(30) },
    annotations: { readOnlyHint: true },
  }, wrap(async ({ limit }) => listVideos(owner, limit)));

  server.registerTool("suggest_caption", {
    title: "Write a caption",
    description: "Writes a caption, title and hashtags for a video from the facts in the ad (no invented claims). Uses the configured AI text provider if any.",
    inputSchema: { video_id: z.string(), platform: z.enum(PLATFORMS).optional(), language: z.enum(["nl", "en", "ar", "fr", "de", "es"]).optional() },
    annotations: { readOnlyHint: true },
  }, wrap(async ({ video_id, platform, language }) => suggestCaption(owner, video_id, { platform, language, llmProvider: await firstConfigured(owner, ["anthropic", "openai", "gemini", "xai", "nvidia"]) })));

  server.registerTool("list_social_accounts", {
    title: "Connected social accounts",
    description: "For every platform whether posting is possible: 'direct' (own API connection), 'ayrshare' (via Ayrshare) or null (not connected).",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, wrap(async () => routes(owner)));

  server.registerTool("schedule_post", {
    title: "Schedule a social post",
    description: "Schedules one video for one or more platforms at a time (or 'now'). The studio publishes it automatically at that time. Caption and hashtags are generated when omitted.",
    inputSchema: PostInput.shape,
    annotations: { destructiveHint: false, openWorldHint: true },
  }, wrap(async (a) => {
    const r = await routes(owner);
    const missing = a.platforms.filter((p) => !r[p]);
    if (missing.length) throw new Error(`Not connected: ${missing.join(", ")}. Connect them in the studio under Social media → Accounts.`);
    const row = await schedulePost(owner, a, "mcp");
    return { post_id: row.id, scheduled_at: row.data.scheduledAt, platforms: row.data.platforms, caption: row.data.caption, hashtags: row.data.hashtags };
  }));

  server.registerTool("auto_schedule", {
    title: "Plan many posts automatically",
    description: "Spreads several videos over days and time slots (one video per slot) and schedules them on the given platforms with generated captions.",
    inputSchema: AutoInput.shape,
    annotations: { destructiveHint: false, openWorldHint: true },
  }, wrap(async (a) => {
    const r = await routes(owner);
    const missing = a.platforms.filter((p) => !r[p]);
    if (missing.length) throw new Error(`Not connected: ${missing.join(", ")}`);
    const rows = await autoSchedule(owner, { ...a, llm_provider: await firstConfigured(owner, ["anthropic", "openai", "gemini", "xai", "nvidia"]) }, "mcp");
    return rows.map((p) => ({ post_id: p.id, video: p.data.title, scheduled_at: p.data.scheduledAt, platforms: p.data.platforms }));
  }));

  server.registerTool("list_posts", {
    title: "List scheduled and published posts",
    description: "Scheduled, published and failed posts with per-platform result links and errors.",
    inputSchema: { status: z.enum(["scheduled", "publishing", "published", "partial", "failed", "cancelled"]).optional() },
    annotations: { readOnlyHint: true },
  }, wrap(async ({ status }) => {
    const rows = await db.list<PostData>("posts", owner, status ? { status } : undefined);
    return rows.sort((a, b) => a.data.scheduledAt.localeCompare(b.data.scheduledAt)).map((p) => ({ post_id: p.id, title: p.data.title, status: p.data.status, scheduled_at: p.data.scheduledAt, platforms: p.data.platforms, results: p.data.results }));
  }));

  server.registerTool("cancel_post", {
    title: "Cancel a scheduled post",
    description: "Cancels a post that has not been published yet.",
    inputSchema: { post_id: z.string() },
    annotations: { destructiveHint: true },
  }, wrap(async ({ post_id }) => {
    await cancelPost(owner, post_id);
    return { cancelled: post_id };
  }));

  return server;
}
