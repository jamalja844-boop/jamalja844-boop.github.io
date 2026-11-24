"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n/context";
import { api } from "@/lib/client";
import { AD_STYLES, type AdStyleId } from "@/lib/engine/styles";
import { LANGUAGES, PROVIDERS } from "@/lib/providers/registry";
import { Badge, ErrorBox, Field, PageHeader } from "@/components/ui";
import type { BrandKitData } from "@/lib/models";
import type { ScrapeResult } from "@/lib/server/scrape";

type Source = "url" | "product" | "image" | "text";
interface Media { id: string; url: string; name: string; kind: string }
interface Prov { id: string; configured: boolean; enabled: boolean }
type Kit = BrandKitData & { id: string };

function CreateInner() {
  const { t, locale } = useT();
  const router = useRouter();
  const sp = useSearchParams();
  const [source, setSource] = useState<Source>((sp.get("source") as Source) || "url");
  const [url, setUrl] = useState(sp.get("url") || "");
  const [scrape, setScrape] = useState<ScrapeResult | null>(null);
  const [prompt, setPrompt] = useState("");
  const [kits, setKits] = useState<Kit[]>([]);
  const [kitId, setKitId] = useState("");
  const [productId, setProductId] = useState("");
  const [media, setMedia] = useState<Media[]>([]);
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const [styles, setStyles] = useState<AdStyleId[]>([(sp.get("style") as AdStyleId) || "motion", "ecommerce", "tiktok"]);
  const [variants, setVariants] = useState(3);
  const [seconds, setSeconds] = useState(15);
  const [aspects, setAspects] = useState<string[]>(["9:16"]);
  const [language, setLanguage] = useState<string>(locale);
  const [provs, setProvs] = useState<Prov[]>([]);
  const [llm, setLlm] = useState("none");
  const [tts, setTts] = useState("none");
  const [voice, setVoice] = useState("");
  const [music, setMusic] = useState("");
  const [captions, setCaptions] = useState(true);
  const [photo, setPhoto] = useState<"none" | "studio" | "openai">("none");
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api<Kit[]>("/api/brandkits").then(setKits).catch(() => {});
    api<Media[]>("/api/media").then(setMedia).catch(() => {});
    api<Prov[]>("/api/settings/providers").then((p) => {
      setProvs(p);
      const ok = (id: string) => p.some((x) => x.id === id && x.configured && x.enabled);
      const l = ["anthropic", "openai", "gemini", "xai"].find(ok);
      if (l) setLlm(l);
      const v = ["elevenlabs", "openai", "google-tts"].find(ok);
      if (v) setTts(v);
    }).catch(() => {});
  }, []);
  const ready = (cat: string) => PROVIDERS.filter((p) => p.categories.includes(cat as never) && provs.some((x) => x.id === p.id && x.configured && x.enabled));
  const kit = kits.find((k) => k.id === kitId);
  const images = media.filter((m) => m.kind === "image");
  const audio = media.filter((m) => m.kind === "audio");

  const analyze = async () => {
    setErr("");
    setBusy(true);
    try {
      setScrape(await api<ScrapeResult>("/api/scrape", { method: "POST", json: { url } }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const upload = async (files: FileList | null) => {
    if (!files) return;
    if (!rights) return setErr(t.create.rights);
    for (const f of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("rights", "true");
      if (kitId) fd.append("brandKitId", kitId);
      try {
        const m = await api<Media>("/api/media", { method: "POST", body: fd });
        setMedia((x) => [m, ...x]);
        setAssetIds((x) => [...x, m.id]);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    }
  };
  const generate = async () => {
    setErr("");
    if (!rights) return setErr(t.create.rights);
    setBusy(true);
    try {
      const r = await api<{ jobId: string }>("/api/generate", {
        method: "POST",
        json: { source, url: source === "url" ? url : undefined, prompt: source === "text" || source === "image" ? prompt : undefined, assetIds, productId: source === "product" ? productId : undefined, brandKitId: kitId || undefined, styles, variants, seconds, aspects, language, llmProvider: llm, ttsProvider: tts, voice: voice || undefined, musicAssetId: music || undefined, captions, productPhoto: photo, rightsConfirmed: rights },
      });
      router.push(`/jobs/${r.jobId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const canGo = useMemo(() => (source === "url" ? !!url : source === "product" ? !!productId : source === "image" ? assetIds.length > 0 : prompt.length > 5) && styles.length > 0 && aspects.length > 0 && rights, [source, url, productId, assetIds, prompt, styles, aspects, rights]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t.create.title} />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          <div className="card space-y-4">
            <div className="flex flex-wrap gap-2">
              {(["url", "product", "image", "text"] as Source[]).map((s) => (
                <button key={s} className={`chip ${source === s ? "chip-on" : ""}`} onClick={() => setSource(s)}>{t.nav[s === "url" ? "website" : s]}</button>
              ))}
            </div>
            {source === "url" && (
              <div className="space-y-3">
                <Field label={t.create.url}>
                  <div className="flex gap-2"><input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t.create.urlPh} /><button className="btn-ghost shrink-0" onClick={analyze} disabled={!url || busy}>{t.create.analyze}</button></div>
                </Field>
                {scrape && (
                  <div className="rounded-lg border border-line bg-bg p-3 text-sm">
                    <div className="mb-2 flex flex-wrap items-center gap-2"><b>{scrape.name}</b>{scrape.price && <Badge tone="ok">{scrape.currency}{scrape.price}</Badge>}{scrape.oldPrice && <Badge>{scrape.currency}{scrape.oldPrice}</Badge>}<Badge tone="info">{scrape.platform}</Badge>{scrape.rating && <Badge>★ {scrape.rating.value} ({scrape.rating.count})</Badge>}</div>
                    <p className="mb-2 line-clamp-3 text-xs text-muted">{scrape.description}</p>
                    <div className="mb-2 flex gap-2 overflow-x-auto">{scrape.images.map((i) => <img key={i} src={i} alt="" className="h-16 w-16 shrink-0 rounded object-cover" referrerPolicy="no-referrer" />)}</div>
                    <div className="flex items-center gap-1">{scrape.colors.map((c) => <span key={c} title={c} className="h-5 w-5 rounded border border-line" style={{ background: c }} />)}<span className="ml-2 text-xs text-muted">{scrape.fonts.join(", ")}</span></div>
                    <p className="mt-2 text-xs text-muted">{t.create.found}: {scrape.sources.join(", ") || "HTML"}</p>
                    {scrape.warnings.map((w) => <p key={w} className="text-xs text-amber-300">⚠ {w}</p>)}
                  </div>
                )}
              </div>
            )}
            {source === "product" && (
              <Field label={t.create.product}>
                <select className="input" value={productId} onChange={(e) => setProductId(e.target.value)} disabled={!kit}>
                  <option value="">—</option>
                  {kit?.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {!kitId && <p className="mt-1 text-xs text-amber-300">↓ {t.create.brandKit}</p>}
              </Field>
            )}
            {(source === "text" || source === "image") && (
              <Field label={t.create.text}><textarea className="input h-28" value={prompt} onChange={(e) => setPrompt(e.target.value)} /></Field>
            )}
            {(source === "image" || source === "text" || source === "url") && (
              <Field label={t.create.images}>
                <input type="file" accept="image/*" multiple className="mb-2 block text-xs" onChange={(e) => upload(e.target.files)} />
                <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                  {images.map((m) => (
                    <button key={m.id} onClick={() => setAssetIds((a) => toggle(a, m.id))} className={`h-16 w-16 overflow-hidden rounded border-2 ${assetIds.includes(m.id) ? "border-accent" : "border-transparent"}`}><img src={m.url} alt={m.name} className="h-full w-full object-cover" /></button>
                  ))}
                </div>
              </Field>
            )}
            <Field label={t.create.brandKit}>
              <select className="input" value={kitId} onChange={(e) => setKitId(e.target.value)}>
                <option value="">{t.create.noKit}</option>
                {kits.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            </Field>
          </div>
          <div className="card space-y-3">
            <label className="label">{t.create.style}</label>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {AD_STYLES.map((s) => (
                <button key={s.id} onClick={() => setStyles((x) => toggle(x, s.id))} className={`rounded-lg border p-2 text-left text-xs ${styles.includes(s.id) ? "border-accent bg-accent/15" : "border-line hover:border-muted"}`}>
                  <div className="font-semibold">{s.name[locale]}</div>
                  <div className="mt-0.5 line-clamp-2 text-muted">{s.description[locale]}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-5 lg:col-span-2">
          <div className="card space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t.create.variants}><input type="number" min={1} max={6} className="input" value={variants} onChange={(e) => setVariants(Math.max(1, Math.min(6, +e.target.value)))} /></Field>
              <Field label={t.create.language}><select className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>{LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select></Field>
            </div>
            <Field label={t.create.duration}><div className="flex gap-2">{[6, 10, 15, 30, 60].map((d) => <button key={d} className={`chip ${seconds === d ? "chip-on" : ""}`} onClick={() => setSeconds(d)}>{d}s</button>)}</div></Field>
            <Field label={t.create.formats}><div className="flex flex-wrap gap-2">{[["9:16", "TikTok / Reels / Shorts"], ["16:9", "YouTube"], ["1:1", "Instagram / Facebook"], ["4:5", "Feed ads"]].map(([a, d]) => <button key={a} title={d} className={`chip ${aspects.includes(a) ? "chip-on" : ""}`} onClick={() => setAspects((x) => toggle(x, a))}>{a}</button>)}</div></Field>
            <Field label={t.create.llm}>
              <select className="input" value={llm} onChange={(e) => setLlm(e.target.value)}>
                <option value="none">{t.create.templateEngine}</option>
                {ready("llm").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t.create.tts}>
                <select className="input" value={tts} onChange={(e) => setTts(e.target.value)}>
                  <option value="none">{t.common.none}</option>
                  {ready("tts").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <Field label={t.create.voice}><input className="input" value={voice} onChange={(e) => setVoice(e.target.value)} placeholder={tts === "openai" ? "coral" : tts === "elevenlabs" ? "voice id" : ""} /></Field>
            </div>
            <Field label={t.create.music}>
              <select className="input" value={music} onChange={(e) => setMusic(e.target.value)}>
                <option value="">{t.common.none}</option>
                {audio.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>
            <Field label={t.create.photo}>
              <select className="input" value={photo} onChange={(e) => setPhoto(e.target.value as typeof photo)}>
                <option value="none">{t.create.photoNone}</option>
                <option value="studio">{t.create.photoStudio}</option>
                {ready("image").length > 0 && <option value="openai">{t.create.photoAi}</option>}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={captions} onChange={(e) => setCaptions(e.target.checked)} /> {t.create.captions}</label>
            <label className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs"><input type="checkbox" className="mt-0.5" checked={rights} onChange={(e) => setRights(e.target.checked)} /> {t.create.rights}</label>
            <ErrorBox error={err} />
            <button className="btn-primary w-full py-3 text-base" disabled={!canGo || busy} onClick={generate}>✦ {t.create.generate} ({variants * aspects.length})</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CreatePage() {
  return <Suspense><CreateInner /></Suspense>;
}
