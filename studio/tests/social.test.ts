import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const creds: Record<string, { values: Record<string, string>; settings: Record<string, string> }> = {};
vi.mock("@/lib/server/secrets", () => ({ getCredentials: async (_o: string, id: string) => creds[id] ?? null }));
const { publish, routes } = await import("@/lib/social/publishers");
const { zonedToUtc } = await import("@/lib/social/posts");

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
let calls: Call[] = [];
let responder: (c: Call) => Response;
beforeEach(() => {
  for (const k of Object.keys(creds)) delete creds[k];
  calls = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const c: Call = { url: String(url), method: init.method ?? "GET", headers: Object.fromEntries(new Headers(init.headers).entries()), body: init.body };
    calls.push(c);
    return responder(c);
  });
  vi.useFakeTimers({ toFake: ["setTimeout"] });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const input = { video: Buffer.from("fake-mp4-bytes"), publicUrl: "https://studio.example.com/api/files/med_1?exp=1&sig=x", title: "Glow Serum", caption: "Meet Glow Serum", hashtags: ["glow", "#skincare"] };
const ok = (j: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(j), { status: 200, headers: { "content-type": "application/json", ...headers } });
const run = async <T,>(p: Promise<T>) => { const out = p; for (let i = 0; i < 80; i++) { await vi.advanceTimersByTimeAsync(5000); } return out; };

describe("routing", () => {
  it("uses direct connections first and Ayrshare for the rest", async () => {
    creds["social-youtube"] = { values: { clientId: "a", clientSecret: "b", refreshToken: "c" }, settings: {} };
    creds["ayrshare"] = { values: { apiKey: "k" }, settings: {} };
    const r = await routes("u1");
    expect(r.youtube).toBe("direct");
    expect(r.linkedin).toBe("ayrshare");
    expect(r.tiktok).toBe("ayrshare");
  });
  it("reports unconnected platforms as errors", async () => {
    const r = await publish("u1", ["instagram"], input);
    expect(r.instagram).toBeInstanceOf(Error);
  });
});

describe("YouTube", () => {
  it("refreshes the token and does a resumable upload", async () => {
    creds["social-youtube"] = { values: { clientId: "cid", clientSecret: "sec", refreshToken: "rt" }, settings: { privacy: "unlisted" } };
    responder = (c) => {
      if (c.url.startsWith("https://oauth2.googleapis.com/token")) return ok({ access_token: "AT" });
      if (c.url.includes("uploadType=resumable")) return new Response(null, { status: 200, headers: { location: "https://upload.example/session1" } });
      if (c.url === "https://upload.example/session1") return ok({ id: "vid123" });
      return new Response("unexpected", { status: 500 });
    };
    const r = await publish("u1", ["youtube"], input);
    expect(r.youtube).toMatchObject({ id: "vid123", url: "https://www.youtube.com/shorts/vid123" });
    const init = calls.find((c) => c.url.includes("uploadType=resumable"))!;
    expect(init.headers.authorization).toBe("Bearer AT");
    const meta = JSON.parse(String(init.body));
    expect(meta.status.privacyStatus).toBe("unlisted");
    expect(meta.snippet.description).toContain("#glow #skincare");
    expect(calls.find((c) => c.url.includes("session1"))!.method).toBe("PUT");
  });
});

describe("Instagram", () => {
  it("creates a Reels container, waits until FINISHED and publishes", async () => {
    creds["social-instagram"] = { values: { accessToken: "IGT" }, settings: { igUserId: "1784", graphVersion: "v23.0" } };
    let polls = 0;
    responder = (c) => {
      if (c.url.endsWith("/1784/media") && c.method === "POST") return ok({ id: "cont1" });
      if (c.url.includes("/cont1?fields=status_code")) return ok({ status_code: ++polls > 1 ? "FINISHED" : "IN_PROGRESS" });
      if (c.url.endsWith("/1784/media_publish")) return ok({ id: "media9" });
      if (c.url.includes("/media9?fields=permalink")) return ok({ permalink: "https://instagram.com/reel/abc" });
      return new Response("unexpected " + c.url, { status: 500 });
    };
    const r = await run(publish("u1", ["instagram"], input));
    expect(r.instagram).toMatchObject({ id: "media9", url: "https://instagram.com/reel/abc" });
    const body = new URLSearchParams(String(calls[0].body));
    expect(body.get("media_type")).toBe("REELS");
    expect(body.get("video_url")).toBe(input.publicUrl);
  });
  it("refuses a localhost video URL with a clear message", async () => {
    creds["social-instagram"] = { values: { accessToken: "IGT" }, settings: { igUserId: "1" } };
    const r = await publish("u1", ["instagram"], { ...input, publicUrl: "http://localhost:3000/api/files/x" });
    expect((r.instagram as Error).message).toMatch(/APP_URL/);
  });
});

describe("TikTok", () => {
  it("uses an allowed privacy level and uploads the file in one chunk", async () => {
    creds["social-tiktok"] = { values: { clientKey: "ck", clientSecret: "cs", refreshToken: "rt" }, settings: { privacy: "PUBLIC_TO_EVERYONE" } };
    responder = (c) => {
      if (c.url.includes("/oauth/token/")) return ok({ access_token: "TT" });
      if (c.url.includes("creator_info")) return ok({ data: { privacy_level_options: ["SELF_ONLY"] } });
      if (c.url.includes("/video/init/")) return ok({ data: { upload_url: "https://upload.tiktok.example/u", publish_id: "p1" }, error: { code: "ok" } });
      if (c.url === "https://upload.tiktok.example/u") return new Response(null, { status: 201 });
      if (c.url.includes("status/fetch")) return ok({ data: { status: "PUBLISH_COMPLETE", publicaly_available_post_id: [777] } });
      return new Response("unexpected", { status: 500 });
    };
    const r = await run(publish("u1", ["tiktok"], input));
    expect(r.tiktok).toMatchObject({ id: "777" });
    const init = JSON.parse(String(calls.find((c) => c.url.includes("/video/init/"))!.body));
    expect(init.post_info.privacy_level).toBe("SELF_ONLY");
    expect(init.source_info).toMatchObject({ source: "FILE_UPLOAD", video_size: input.video.length, total_chunk_count: 1 });
    expect(calls.find((c) => c.url.includes("upload.tiktok"))!.headers["content-range"]).toBe(`bytes 0-${input.video.length - 1}/${input.video.length}`);
  });
});

describe("Facebook + Ayrshare", () => {
  it("posts a page video by URL and other networks through Ayrshare", async () => {
    creds["social-facebook"] = { values: { pageAccessToken: "PT" }, settings: { pageId: "55" } };
    creds["ayrshare"] = { values: { apiKey: "AK" }, settings: {} };
    responder = (c) => {
      if (c.url.endsWith("/55/videos")) return ok({ id: "fbv1" });
      if (c.url === "https://api.ayrshare.com/api/post") return ok({ status: "success", postIds: [{ platform: "linkedin", id: "li1", postUrl: "https://linkedin.com/x", status: "success" }], errors: [{ platform: "twitter", message: "X account not linked" }] });
      return new Response("unexpected", { status: 500 });
    };
    const r = await publish("u1", ["facebook", "linkedin", "x"], input);
    expect(r.facebook).toMatchObject({ id: "fbv1" });
    expect(r.linkedin).toMatchObject({ id: "li1", via: "ayrshare" });
    expect((r.x as Error).message).toBe("X account not linked");
    const ay = JSON.parse(String(calls.find((c) => c.url.includes("ayrshare"))!.body));
    expect(ay.platforms).toEqual(["linkedin", "twitter"]);
    expect(ay.mediaUrls).toEqual([input.publicUrl]);
  });
});

describe("time zones", () => {
  it("converts Amsterdam wall-clock time to UTC across DST", () => {
    expect(zonedToUtc("2026-07-01", "12:00", "Europe/Amsterdam").toISOString()).toBe("2026-07-01T10:00:00.000Z");
    expect(zonedToUtc("2026-12-01", "19:30", "Europe/Amsterdam").toISOString()).toBe("2026-12-01T18:30:00.000Z");
    expect(zonedToUtc("2026-12-01", "09:00", "America/New_York").toISOString()).toBe("2026-12-01T14:00:00.000Z");
  });
});
