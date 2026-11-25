// Publishing to social networks through their official APIs.
//  - YouTube: Data API v3 resumable upload (OAuth refresh token)
//  - TikTok: Content Posting API, direct post with FILE_UPLOAD
//  - Instagram: Graph API Reels container -> media_publish (needs a public video URL)
//  - Facebook Page: Graph API /{page}/videos with file_url (needs a public video URL)
//  - Everything else (LinkedIn, X, Pinterest, Threads, Bluesky, …): Ayrshare, one API key
import { getCredentials } from "../server/secrets";
import { getProvider } from "../providers/registry";

export const PLATFORMS = ["tiktok", "instagram", "youtube", "facebook", "linkedin", "x", "pinterest", "threads", "bluesky"] as const;
export type Platform = (typeof PLATFORMS)[number];

const DIRECT: Partial<Record<Platform, string>> = { youtube: "social-youtube", tiktok: "social-tiktok", instagram: "social-instagram", facebook: "social-facebook" };
const AYRSHARE_NAME: Record<Platform, string> = { tiktok: "tiktok", instagram: "instagram", youtube: "youtube", facebook: "facebook", linkedin: "linkedin", x: "twitter", pinterest: "pinterest", threads: "threads", bluesky: "bluesky" };

export interface PublishInput {
  video: Buffer;
  /** public, time-limited URL of the same video (for APIs that pull the file) */
  publicUrl: string;
  title: string;
  caption: string;
  hashtags: string[];
}

export interface PublishResult {
  id?: string;
  url?: string;
  via: string;
  note?: string;
}

async function creds(owner: string, id: string) {
  const c = await getCredentials(owner, id);
  const def = getProvider(id);
  if (!c || !def) return null;
  return { values: c.values, settings: { ...Object.fromEntries(def.settings.map((s) => [s.key, s.default ?? ""])), ...c.settings } };
}

/** How each platform would be published for this user ("direct", "ayrshare" or null = not connected). */
export async function routes(owner: string): Promise<Record<Platform, "direct" | "ayrshare" | null>> {
  const ayr = !!(await creds(owner, "ayrshare"));
  const out = {} as Record<Platform, "direct" | "ayrshare" | null>;
  for (const p of PLATFORMS) {
    const d = DIRECT[p];
    out[p] = d && (await creds(owner, d)) ? "direct" : ayr ? "ayrshare" : null;
  }
  return out;
}

async function json(r: Response, label: string) {
  const text = await r.text();
  let j: unknown = null;
  try {
    j = text ? JSON.parse(text) : null;
  } catch {
    /* not json */
  }
  if (!r.ok) throw new Error(`${label} ${r.status}: ${text.slice(0, 400)}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return j as any;
}

const fullText = (i: PublishInput) => [i.caption.trim(), i.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")].filter(Boolean).join("\n\n");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function assertPublic(url: string, platform: string) {
  const h = new URL(url).hostname;
  if (h === "localhost" || h === "127.0.0.1" || h.endsWith(".local")) {
    throw new Error(`${platform} downloads the video from your server, so APP_URL must be a public https address (now ${new URL(url).origin}).`);
  }
}

/* ------------------------------- YouTube -------------------------------- */
async function youtube(owner: string, i: PublishInput): Promise<PublishResult> {
  const c = (await creds(owner, "social-youtube"))!;
  const tok = await json(await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.values.clientId, client_secret: c.values.clientSecret, refresh_token: c.values.refreshToken, grant_type: "refresh_token" }),
  }), "Google OAuth");
  const meta = {
    snippet: { title: i.title.slice(0, 100), description: fullText(i).slice(0, 4900), tags: i.hashtags.slice(0, 15), categoryId: c.settings.categoryId || "22" },
    status: { privacyStatus: c.settings.privacy || "public", selfDeclaredMadeForKids: false },
  };
  const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: { Authorization: `Bearer ${tok.access_token}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": String(i.video.length) },
    body: JSON.stringify(meta),
  });
  if (!init.ok) throw new Error(`YouTube init ${init.status}: ${(await init.text()).slice(0, 300)}`);
  const loc = init.headers.get("location");
  if (!loc) throw new Error("YouTube did not return an upload URL");
  const up = await json(await fetch(loc, { method: "PUT", headers: { "Content-Type": "video/mp4", "Content-Length": String(i.video.length) }, body: new Uint8Array(i.video) }), "YouTube upload");
  return { id: up.id, url: `https://www.youtube.com/shorts/${up.id}`, via: "youtube" };
}

/* -------------------------------- TikTok -------------------------------- */
async function tiktok(owner: string, i: PublishInput): Promise<PublishResult> {
  const c = (await creds(owner, "social-tiktok"))!;
  const tok = await json(await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_key: c.values.clientKey, client_secret: c.values.clientSecret, grant_type: "refresh_token", refresh_token: c.values.refreshToken }),
  }), "TikTok OAuth");
  if (!tok.access_token) throw new Error(`TikTok OAuth: ${JSON.stringify(tok).slice(0, 200)}`);
  const auth = { Authorization: `Bearer ${tok.access_token}`, "Content-Type": "application/json; charset=UTF-8" };
  // the privacy level must be one the creator allows
  const info = await json(await fetch("https://open.tiktokapis.com/v2/post/publish/creator_info/query/", { method: "POST", headers: auth }), "TikTok creator info");
  const allowed: string[] = info.data?.privacy_level_options ?? [];
  const privacy = allowed.includes(c.settings.privacy) ? c.settings.privacy : allowed.includes("SELF_ONLY") ? "SELF_ONLY" : allowed[0];
  const size = i.video.length;
  if (size > 64 * 1024 * 1024) throw new Error("Video larger than 64 MB; export at 1080p for TikTok");
  const init = await json(await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ post_info: { title: fullText(i).slice(0, 2200), privacy_level: privacy, disable_comment: false, disable_duet: false, disable_stitch: false }, source_info: { source: "FILE_UPLOAD", video_size: size, chunk_size: size, total_chunk_count: 1 } }),
  }), "TikTok init");
  if (init.error?.code && init.error.code !== "ok") throw new Error(`TikTok: ${init.error.message}`);
  const put = await fetch(init.data.upload_url, { method: "PUT", headers: { "Content-Type": "video/mp4", "Content-Length": String(size), "Content-Range": `bytes 0-${size - 1}/${size}` }, body: new Uint8Array(i.video) });
  if (!put.ok) throw new Error(`TikTok upload ${put.status}: ${(await put.text()).slice(0, 200)}`);
  const publishId = init.data.publish_id;
  for (let k = 0; k < 30; k++) {
    await sleep(5000);
    const st = await json(await fetch("https://open.tiktokapis.com/v2/post/publish/status/fetch/", { method: "POST", headers: auth, body: JSON.stringify({ publish_id: publishId }) }), "TikTok status");
    const s = st.data?.status;
    if (s === "PUBLISH_COMPLETE") {
      const pid = st.data?.publicaly_available_post_id?.[0] ?? st.data?.publicly_available_post_id?.[0];
      return { id: pid ? String(pid) : publishId, via: "tiktok", note: privacy === "SELF_ONLY" ? "posted privately (TikTok only allows public posts from audited apps)" : undefined };
    }
    if (s === "FAILED") throw new Error(`TikTok: ${st.data?.fail_reason ?? "publish failed"}`);
  }
  return { id: publishId, via: "tiktok", note: "uploaded; TikTok is still processing" };
}

/* ------------------------------- Instagram ------------------------------ */
async function instagram(owner: string, i: PublishInput): Promise<PublishResult> {
  const c = (await creds(owner, "social-instagram"))!;
  assertPublic(i.publicUrl, "Instagram");
  const g = `https://graph.facebook.com/${c.settings.graphVersion || "v23.0"}`;
  const token = c.values.accessToken;
  const create = await json(await fetch(`${g}/${encodeURIComponent(c.settings.igUserId)}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ media_type: "REELS", video_url: i.publicUrl, caption: fullText(i).slice(0, 2200), share_to_feed: "true", access_token: token }),
  }), "Instagram container");
  for (let k = 0; k < 60; k++) {
    await sleep(5000);
    const st = await json(await fetch(`${g}/${create.id}?fields=status_code,status&access_token=${encodeURIComponent(token)}`), "Instagram status");
    if (st.status_code === "FINISHED") break;
    if (st.status_code === "ERROR" || st.status_code === "EXPIRED") throw new Error(`Instagram processing: ${st.status ?? st.status_code}`);
    if (k === 59) throw new Error("Instagram is still processing the video after 5 minutes");
  }
  const pub = await json(await fetch(`${g}/${encodeURIComponent(c.settings.igUserId)}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ creation_id: create.id, access_token: token }),
  }), "Instagram publish");
  const link = await fetch(`${g}/${pub.id}?fields=permalink&access_token=${encodeURIComponent(token)}`).then((r) => r.json()).catch(() => ({}));
  return { id: pub.id, url: link.permalink, via: "instagram" };
}

/* ------------------------------- Facebook ------------------------------- */
async function facebook(owner: string, i: PublishInput): Promise<PublishResult> {
  const c = (await creds(owner, "social-facebook"))!;
  assertPublic(i.publicUrl, "Facebook");
  const g = `https://graph.facebook.com/${c.settings.graphVersion || "v23.0"}`;
  const r = await json(await fetch(`${g}/${encodeURIComponent(c.settings.pageId)}/videos`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ file_url: i.publicUrl, title: i.title.slice(0, 255), description: fullText(i), access_token: c.values.pageAccessToken }),
  }), "Facebook");
  return { id: r.id, url: `https://www.facebook.com/${c.settings.pageId}/videos/${r.id}`, via: "facebook" };
}

/* ------------------------------- Ayrshare ------------------------------- */
async function ayrshare(owner: string, platforms: Platform[], i: PublishInput): Promise<Record<string, PublishResult | Error>> {
  const c = (await creds(owner, "ayrshare"))!;
  assertPublic(i.publicUrl, "Ayrshare");
  const r = await fetch("https://api.ayrshare.com/api/post", {
    method: "POST",
    headers: { Authorization: `Bearer ${c.values.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      post: fullText(i), platforms: platforms.map((p) => AYRSHARE_NAME[p]), mediaUrls: [i.publicUrl], isVideo: true,
      youTubeOptions: platforms.includes("youtube") ? { title: i.title.slice(0, 100), visibility: "public", shorts: true } : undefined,
    }),
  });
  const j = await json(r, "Ayrshare").catch((e) => ({ status: "error", message: String(e.message) }));
  const out: Record<string, PublishResult | Error> = {};
  for (const p of platforms) {
    const name = AYRSHARE_NAME[p];
    const ok = (j.postIds ?? []).find((x: { platform: string }) => x.platform === name);
    const err = (j.errors ?? []).find((x: { platform: string }) => x.platform === name);
    if (ok && ok.status !== "error") out[p] = { id: ok.id, url: ok.postUrl, via: "ayrshare" };
    else out[p] = new Error(err?.message ?? j.message ?? "Ayrshare: not posted");
  }
  return out;
}

/** Publishes one video to several platforms; returns a result or error per platform. */
export async function publish(owner: string, platforms: Platform[], input: PublishInput): Promise<Record<string, PublishResult | Error>> {
  const r = await routes(owner);
  const out: Record<string, PublishResult | Error> = {};
  const viaAyrshare: Platform[] = [];
  for (const p of platforms) {
    if (r[p] === "direct") {
      try {
        out[p] = await ({ youtube, tiktok, instagram, facebook } as Record<string, (o: string, i: PublishInput) => Promise<PublishResult>>)[p](owner, input);
      } catch (e) {
        out[p] = e instanceof Error ? e : new Error(String(e));
      }
    } else if (r[p] === "ayrshare") viaAyrshare.push(p);
    else out[p] = new Error(`${p} is not connected (Social media → Accounts)`);
  }
  if (viaAyrshare.length) Object.assign(out, await ayrshare(owner, viaAyrshare, input));
  return out;
}
