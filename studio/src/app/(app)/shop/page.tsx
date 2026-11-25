"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useT } from "@/lib/i18n/context";
import { api } from "@/lib/client";
import { AD_STYLES } from "@/lib/engine/styles";
import { LANGUAGES, PROVIDERS } from "@/lib/providers/registry";
import { Badge, ErrorBox, Field, PageHeader } from "@/components/ui";
import type { ShopProduct, ShopScan } from "@/lib/server/shop";

interface Prov { id: string; configured: boolean; enabled: boolean }

function ShopInner() {
  const { t, locale } = useT();
  const router = useRouter();
  const sp = useSearchParams();
  const [url, setUrl] = useState(sp.get("url") ?? "");
  const [scan, setScan] = useState<ShopScan | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [provs, setProvs] = useState<Prov[]>([]);
  const [style, setStyle] = useState("auto");
  const [seconds, setSeconds] = useState(15);
  const [aspects, setAspects] = useState<string[]>(["9:16"]);
  const [language, setLanguage] = useState<string>(locale);
  const [llm, setLlm] = useState("none");
  const [tts, setTts] = useState("none");
  const [voice, setVoice] = useState("");
  const [music, setMusic] = useState<"auto" | "none">("auto");
  const [studio, setStudio] = useState(true);
  const [clip, setClip] = useState("");
  const [quality, setQuality] = useState<"1080p" | "4k">("1080p");
  const [captions, setCaptions] = useState(true);
  const [rights, setRights] = useState(false);

  const ok = (id: string, p = provs) => p.some((x) => x.id === id && x.configured && x.enabled);
  useEffect(() => {
    api<Prov[]>("/api/settings/providers").then((p) => {
      setProvs(p);
      const l = ["anthropic", "openai", "gemini", "xai", "nvidia"].find((id) => ok(id, p));
      if (l) setLlm(l);
      const v = ["elevenlabs", "openai", "google-tts"].find((id) => ok(id, p));
      if (v) setTts(v);
    }).catch(() => {});
    if (sp.get("url")) void doScan(sp.get("url")!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doScan = async (u = url) => {
    setErr("");
    setBusy(true);
    setScan(null);
    try {
      const r = await api<ShopScan>("/api/shop/scan", { method: "POST", json: { url: u, limit: 48 } });
      setScan(r);
      setSel(new Set(r.products.slice(0, 6).map((p) => p.id)));
      if (!r.products.length) setErr(r.warnings.join(" ") || "—");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const go = async () => {
    if (!scan) return;
    setErr("");
    setBusy(true);
    try {
      const products: ShopProduct[] = scan.products.filter((p) => sel.has(p.id));
      const r = await api<{ batchId: string }>("/api/shop/generate", {
        method: "POST",
        json: {
          shop: { shopName: scan.shopName, logo: scan.logo, colors: scan.colors.filter((c) => /^#[0-9a-f]{6}$/i.test(c)), fonts: scan.fonts },
          products,
          options: { style, variants: 1, seconds, aspects, language, llmProvider: llm, ttsProvider: tts, voice: voice || undefined, music, captions, productPhoto: studio ? "studio" : "none", aiClipProvider: clip || undefined, autoRender: quality, rightsConfirmed: true },
        },
      });
      router.push(`/shop/batch/${r.batchId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  const ttsList = PROVIDERS.filter((p) => p.categories.includes("tts") && ok(p.id));
  const llmList = PROVIDERS.filter((p) => p.categories.includes("llm") && ok(p.id));
  const clipList = PROVIDERS.filter((p) => ["runway", "gemini", "kling"].includes(p.id) && ok(p.id));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t.shop.title} subtitle={t.shop.subtitle} />
      <form className="card mb-6 flex flex-wrap gap-3 bg-gradient-to-r from-accent/20 to-accent2/10" onSubmit={(e) => { e.preventDefault(); void doScan(); }}>
        <input className="input min-w-[280px] flex-1 py-3 text-base" type="url" required placeholder={t.shop.url} value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="btn-primary px-6 text-base" disabled={busy || !url}>{busy && !scan ? t.shop.scanning : `🛒 ${t.shop.scan}`}</button>
      </form>
      <ErrorBox error={err} />

      {scan && scan.products.length > 0 && (
        <div className="mt-4 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <b>{scan.shopName}</b>
              <Badge tone="info">{scan.platform}</Badge>
              <span className="text-sm text-muted">{scan.products.length} {t.shop.found} · {sel.size} ✓</span>
              <span className="flex gap-1">{scan.colors.slice(0, 4).map((c) => <span key={c} className="h-4 w-4 rounded" style={{ background: c }} />)}</span>
              <button className="btn-ghost btn-xs ml-auto" onClick={() => setSel(new Set(scan.products.map((p) => p.id)))}>{t.shop.selectAll}</button>
              <button className="btn-ghost btn-xs" onClick={() => setSel(new Set())}>{t.shop.selectNone}</button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {scan.products.map((p) => (
                <button key={p.id} onClick={() => toggle(p.id)} className={`overflow-hidden rounded-xl border-2 bg-panel text-left transition ${sel.has(p.id) ? "border-accent" : "border-line opacity-60 hover:opacity-100"}`}>
                  <div className="relative aspect-square bg-white">
                    {p.images[0] ? <img src={p.images[0]} alt="" referrerPolicy="no-referrer" className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-muted">—</div>}
                    <span className={`absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-sm ${sel.has(p.id) ? "bg-accent text-white" : "bg-black/40 text-white"}`}>{sel.has(p.id) ? "✓" : ""}</span>
                  </div>
                  <div className="p-2">
                    <div className="line-clamp-2 text-sm font-medium">{p.name}</div>
                    <div className="text-xs text-muted">{p.price ? `${p.currency ?? ""}${p.price}` : ""}{p.oldPrice ? <span className="ml-1 line-through">{p.currency}{p.oldPrice}</span> : null} · {p.images.length} 📷</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="card h-fit space-y-4 lg:sticky lg:top-4">
            <Field label={t.shop.style}>
              <select className="input" value={style} onChange={(e) => setStyle(e.target.value)}>
                <option value="auto">{t.shop.auto}</option>
                {AD_STYLES.map((s) => <option key={s.id} value={s.id}>{s.name[locale]}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t.shop.duration}><select className="input" value={seconds} onChange={(e) => setSeconds(+e.target.value)}>{[6, 10, 15, 30, 60].map((d) => <option key={d} value={d}>{d}s</option>)}</select></Field>
              <Field label={t.shop.lang}><select className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>{LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select></Field>
            </div>
            <Field label={t.shop.formats}>
              <div className="flex flex-wrap gap-2">{[["9:16", "TikTok/Reels"], ["1:1", "Instagram"], ["4:5", "Feed"], ["16:9", "YouTube"]].map(([a, d]) => <button key={a} type="button" title={d} className={`chip ${aspects.includes(a) ? "chip-on" : ""}`} onClick={() => setAspects((x) => (x.includes(a) ? (x.length > 1 ? x.filter((y) => y !== a) : x) : [...x, a]))}>{a}</button>)}</div>
            </Field>
            <Field label={t.shop.texts}>
              <select className="input" value={llm} onChange={(e) => setLlm(e.target.value)}>
                <option value="none">{t.create.templateEngine}</option>
                {llmList.map((p) => <option key={p.id} value={p.id}>AI · {p.name}</option>)}
              </select>
            </Field>
            <Field label={t.shop.voice} hint={!ttsList.length ? t.shop.voiceHint : undefined}>
              <div className="flex gap-2">
                <select className="input" value={tts} onChange={(e) => setTts(e.target.value)}>
                  <option value="none">{t.shop.noVoice}</option>
                  {ttsList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {tts !== "none" && <input className="input w-28" placeholder={t.create.voice} value={voice} onChange={(e) => setVoice(e.target.value)} />}
              </div>
              {!ttsList.length && <Link href="/settings" className="text-xs text-accent2">{t.nav.settings} →</Link>}
            </Field>
            <Field label={t.shop.music}>
              <select className="input" value={music} onChange={(e) => setMusic(e.target.value as "auto" | "none")}>
                <option value="auto">🎵 {t.shop.musicAuto}</option>
                <option value="none">{t.shop.musicNone}</option>
              </select>
            </Field>
            <Field label={t.shop.clip} hint={t.shop.clipHint}>
              <select className="input" value={clip} onChange={(e) => setClip(e.target.value)}>
                <option value="">{t.shop.clipNone}</option>
                {clipList.map((p) => <option key={p.id} value={p.id}>{p.id === "gemini" ? "Google Veo" : p.name}</option>)}
              </select>
            </Field>
            <div className="space-y-1 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={studio} onChange={(e) => setStudio(e.target.checked)} />📸 {t.shop.photosStudio}</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={captions} onChange={(e) => setCaptions(e.target.checked)} />💬 {t.create.captions}</label>
              <label className="flex items-center gap-2">{t.shop.quality}: <select className="input w-auto py-1" value={quality} onChange={(e) => setQuality(e.target.value as "1080p" | "4k")}><option>1080p</option><option value="4k">4K</option></select></label>
            </div>
            <label className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs"><input type="checkbox" className="mt-0.5" checked={rights} onChange={(e) => setRights(e.target.checked)} />{t.create.rights}</label>
            <button className="btn-primary w-full py-3 text-base" disabled={busy || !sel.size || !rights} onClick={go}>🎬 {t.shop.go} ({sel.size * aspects.length})</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ShopPage() {
  return <Suspense><ShopInner /></Suspense>;
}
