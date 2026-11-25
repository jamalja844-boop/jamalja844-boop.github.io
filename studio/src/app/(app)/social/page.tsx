"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n/context";
import { api } from "@/lib/client";
import { Badge, ErrorBox, Field, PageHeader } from "@/components/ui";
import type { PostData } from "@/lib/social/posts";

const PLATFORMS = ["tiktok", "instagram", "youtube", "facebook", "linkedin", "x", "pinterest", "threads", "bluesky"] as const;
const LABEL: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube", facebook: "Facebook", linkedin: "LinkedIn", x: "X", pinterest: "Pinterest", threads: "Threads", bluesky: "Bluesky" };
type Routes = Record<string, "direct" | "ayrshare" | null>;
interface Video { video_id: string; name: string; product?: string; aspect: string; seconds: number; download_url: string; scheduled_posts: { post_id: string }[] }
type Post = PostData & { id: string };

const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

function PlatformPicker({ routes, value, onChange }: { routes: Routes; value: string[]; onChange: (v: string[]) => void }) {
  const { t } = useT();
  return (
    <div className="flex flex-wrap gap-2">
      {PLATFORMS.map((p) => {
        const r = routes[p];
        return (
          <button key={p} type="button" disabled={!r} title={r ? (r === "direct" ? t.social.direct : t.social.via) : t.social.notConnected}
            onClick={() => onChange(value.includes(p) ? value.filter((x) => x !== p) : [...value, p])}
            className={`chip ${value.includes(p) ? "chip-on" : ""} ${!r ? "cursor-not-allowed opacity-40" : ""}`}>
            {LABEL[p]}{r === "ayrshare" ? " ·A" : ""}
          </button>
        );
      })}
    </div>
  );
}

function SocialInner() {
  const { t, locale } = useT();
  const sp = useSearchParams();
  const [tab, setTab] = useState(sp.get("tab") ?? "planning");
  const [routes, setRoutes] = useState<Routes>({});
  const [videos, setVideos] = useState<Video[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  // new post
  const [video, setVideo] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [tags, setTags] = useState("");
  const [when, setWhen] = useState(localInput(new Date(Date.now() + 3600_000)));
  // auto
  const [sel, setSel] = useState<string[]>(sp.get("videos")?.split(",").filter(Boolean) ?? []);
  const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
  const [start, setStart] = useState(tomorrow);
  const [times, setTimes] = useState("12:00, 19:30");
  const [tz, setTz] = useState(typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "Europe/Amsterdam");

  const load = () => {
    api<Routes>("/api/social/accounts").then(setRoutes).catch(() => {});
    api<Video[]>("/api/social/videos").then((v) => { setVideos(v); setVideo((cur) => cur || v[0]?.video_id || ""); }).catch(() => {});
    api<Post[]>("/api/social/posts").then(setPosts).catch(() => {});
  };
  useEffect(() => { load(); const i = setInterval(() => api<Post[]>("/api/social/posts").then(setPosts).catch(() => {}), 8000); return () => clearInterval(i); }, []);
  const connected = Object.values(routes).some(Boolean);

  const suggest = async () => {
    setErr("");
    try {
      const r = await api<{ title: string; caption: string; hashtags: string[] }>("/api/social/caption", { method: "POST", json: { video_id: video, language: locale } });
      setTitle(r.title); setCaption(r.caption); setTags(r.hashtags.join(", "));
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  const submit = async (now: boolean) => {
    setErr(""); setMsg("");
    try {
      await api("/api/social/posts", { method: "POST", json: { video_id: video, platforms, caption: caption || undefined, title: title || undefined, hashtags: tags ? tags.split(",").map((s) => s.trim()).filter(Boolean) : undefined, scheduled_at: now ? "now" : new Date(when).toISOString() } });
      setMsg("✓"); setTab("planning"); load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  const plan = async () => {
    setErr(""); setMsg("");
    try {
      const r = await api<{ id: string; at: string }[]>("/api/social/auto", { method: "POST", json: { video_ids: sel, platforms, start_date: start, times: times.split(",").map((s) => s.trim()).filter(Boolean), timezone: tz, language: locale } });
      setMsg(`✓ ${r.length}`); setTab("planning"); load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  const act = async (id: string, action: string) => { await api(`/api/social/posts/${id}`, { method: "POST", json: { action } }).catch((e) => setErr(e.message)); load(); };
  const del = async (id: string) => { await api(`/api/social/posts/${id}`, { method: "DELETE" }).catch((e) => setErr(e.message)); load(); };

  const byDay = useMemo(() => {
    const m = new Map<string, Post[]>();
    for (const p of posts) {
      const d = new Date(p.scheduledAt).toLocaleDateString(locale === "nl" ? "nl-NL" : "en-GB", { weekday: "long", day: "numeric", month: "long" });
      m.set(d, [...(m.get(d) ?? []), p]);
    }
    return [...m.entries()];
  }, [posts, locale]);
  const tone = (s: string) => (s === "published" ? "ok" : s === "failed" ? "err" : s === "partial" ? "warn" : s === "cancelled" ? "muted" : "info") as "ok" | "err" | "warn" | "muted" | "info";

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t.social.title} subtitle={t.social.subtitle} />
      <div className="mb-4 flex flex-wrap gap-2">
        {(["planning", "new", "auto", "accounts"] as const).map((k) => <button key={k} className={`chip px-3 py-1 text-sm ${tab === k ? "chip-on" : ""}`} onClick={() => setTab(k)}>{k === "planning" ? t.social.planning : k === "new" ? t.social.newPost : k === "auto" ? t.social.auto : t.social.accounts}</button>)}
      </div>
      {!connected && tab !== "accounts" && <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">{t.social.connectHint} <button className="underline" onClick={() => setTab("accounts")}>{t.social.accounts} →</button></div>}
      <ErrorBox error={err} />
      {msg && <p className="mb-2 text-sm text-emerald-300">{msg}</p>}

      {tab === "planning" && (
        <div className="space-y-6">
          <p className="text-xs text-muted">{t.social.workerHint}</p>
          {!posts.length && <p className="text-muted">{t.social.empty}</p>}
          {byDay.map(([day, list]) => (
            <div key={day}>
              <h3 className="mb-2 text-sm font-semibold capitalize text-muted">{day}</h3>
              <div className="space-y-2">
                {list.map((p) => (
                  <div key={p.id} className="card flex flex-wrap items-start gap-3 p-3 text-sm">
                    <div className="w-14 font-mono text-accent2">{new Date(p.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{p.title}</div>
                      <div className="line-clamp-2 whitespace-pre-line text-xs text-muted">{p.caption}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {p.platforms.map((pl) => {
                          const r = p.results[pl];
                          return r?.url ? <a key={pl} href={r.url} target="_blank" rel="noreferrer"><Badge tone="ok">{LABEL[pl]} ↗</Badge></a> : <span key={pl} title={r?.error ?? r?.note}><Badge tone={r?.status === "failed" ? "err" : r?.status === "published" ? "ok" : "muted"}>{LABEL[pl]}</Badge></span>;
                        })}
                        {p.source === "mcp" && <Badge tone="info">MCP</Badge>}
                      </div>
                      {Object.values(p.results).filter((r) => r.error || r.note).map((r, i) => <p key={i} className={`mt-1 text-xs ${r.error ? "text-red-300" : "text-muted"}`}>{r.error ?? r.note}</p>)}
                    </div>
                    <Badge tone={tone(p.status)}>{t.social.status[p.status]}</Badge>
                    <div className="flex gap-1">
                      {p.status === "scheduled" && <button className="btn-ghost btn-xs" onClick={() => act(p.id, "publish_now")}>{t.social.publishNow}</button>}
                      {p.status === "scheduled" && <button className="btn-ghost btn-xs" onClick={() => act(p.id, "cancel")}>{t.social.cancel}</button>}
                      {["failed", "partial", "cancelled"].includes(p.status) && <button className="btn-ghost btn-xs" onClick={() => act(p.id, "retry")}>{t.social.retry}</button>}
                      {p.status !== "publishing" && <button className="btn-ghost btn-xs" onClick={() => del(p.id)}>🗑</button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "new" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="card space-y-3">
            <Field label={t.social.video}>
              <select className="input" value={video} onChange={(e) => setVideo(e.target.value)}>{videos.map((v) => <option key={v.video_id} value={v.video_id}>{v.name} · {v.aspect}</option>)}</select>
            </Field>
            {video && <video key={video} src={videos.find((v) => v.video_id === video)?.download_url} controls className="mx-auto max-h-80 rounded bg-black" />}
          </div>
          <div className="card space-y-3">
            <Field label={t.social.platforms}><PlatformPicker routes={routes} value={platforms} onChange={setPlatforms} /></Field>
            <div className="flex justify-end"><button className="btn-ghost btn-xs" disabled={!video} onClick={suggest}>✦ {t.social.suggest}</button></div>
            <Field label={t.social.postTitle}><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
            <Field label={t.social.caption}><textarea className="input h-28" value={caption} onChange={(e) => setCaption(e.target.value)} /></Field>
            <Field label={t.social.hashtags}><input className="input" value={tags} onChange={(e) => setTags(e.target.value)} /></Field>
            <Field label={t.social.when}><input type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
            <div className="flex gap-2">
              <button className="btn-primary flex-1" disabled={!video || !platforms.length} onClick={() => submit(false)}>📅 {t.social.schedule}</button>
              <button className="btn-ghost" disabled={!video || !platforms.length} onClick={() => submit(true)}>{t.social.now}</button>
            </div>
          </div>
        </div>
      )}

      {tab === "auto" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="card space-y-2">
            <div className="flex items-center justify-between"><span className="label">{t.social.selectVideos} ({sel.length})</span><button className="btn-ghost btn-xs" onClick={() => setSel(videos.filter((v) => !v.scheduled_posts.length).map((v) => v.video_id))}>+ {t.shop.selectAll}</button></div>
            <div className="max-h-[480px] space-y-1 overflow-y-auto">
              {videos.map((v) => (
                <label key={v.video_id} className="flex items-center gap-2 rounded bg-bg p-2 text-sm">
                  <input type="checkbox" checked={sel.includes(v.video_id)} onChange={() => setSel((s) => (s.includes(v.video_id) ? s.filter((x) => x !== v.video_id) : [...s, v.video_id]))} />
                  <span className="flex-1 truncate">{v.name}</span><Badge>{v.aspect}</Badge>{v.scheduled_posts.length > 0 && <Badge tone="info">📅 {v.scheduled_posts.length}</Badge>}
                </label>
              ))}
            </div>
          </div>
          <div className="card space-y-3">
            <Field label={t.social.platforms}><PlatformPicker routes={routes} value={platforms} onChange={setPlatforms} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t.social.startDate}><input type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
              <Field label={t.social.timezone}><input className="input" value={tz} onChange={(e) => setTz(e.target.value)} /></Field>
            </div>
            <Field label={t.social.times} hint="12:00, 19:30"><input className="input" value={times} onChange={(e) => setTimes(e.target.value)} /></Field>
            <button className="btn-primary w-full" disabled={!sel.length || !platforms.length} onClick={plan}>📅 {t.social.planAll} ({sel.length})</button>
          </div>
        </div>
      )}

      {tab === "accounts" && (
        <div className="card space-y-3">
          <p className="text-sm text-muted">{t.social.connectHint}</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {PLATFORMS.map((p) => <div key={p} className="flex items-center justify-between rounded bg-bg p-2 text-sm">{LABEL[p]}<Badge tone={routes[p] ? "ok" : "muted"}>{routes[p] === "direct" ? t.social.direct : routes[p] === "ayrshare" ? t.social.via : t.social.notConnected}</Badge></div>)}
          </div>
          <Link href="/settings#social" className="btn-primary">{t.nav.settings} → Social media</Link>
        </div>
      )}
    </div>
  );
}

export default function SocialPage() {
  return <Suspense><SocialInner /></Suspense>;
}
