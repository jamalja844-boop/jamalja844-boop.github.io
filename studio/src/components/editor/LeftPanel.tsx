"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { useT } from "@/lib/i18n/context";
import { anim, makeClip } from "@/remotion/defaults";
import type { Clip } from "@/remotion/types";
import { AD_STYLES } from "@/lib/engine/styles";
import { restyle } from "@/lib/engine/restyle";
import { LANGUAGES, PROVIDERS } from "@/lib/providers/registry";
import type { BrandKitData } from "@/lib/models";
import { findClip, type EditorApi } from "./useEditor";

interface Media { id: string; url: string; name: string; kind: string; width?: number; height?: number; duration?: number }
type Tab = "media" | "texts" | "elements" | "music" | "templates" | "brand" | "ai";

export function LeftPanel({ ed }: { ed: EditorApi }) {
  const { t, locale } = useT();
  const [tab, setTab] = useState<Tab>("media");
  const [media, setMedia] = useState<Media[]>([]);
  const [kits, setKits] = useState<(BrandKitData & { id: string })[]>([]);
  const [err, setErr] = useState("");
  const { doc, frame } = ed;
  const W = doc.width;
  const H = doc.height;
  const reload = () => api<Media[]>("/api/media").then(setMedia).catch(() => {});
  useEffect(() => {
    reload();
    api<(BrandKitData & { id: string })[]>("/api/brandkits").then(setKits).catch(() => {});
  }, []);

  const dur = Math.min(90, Math.max(15, doc.durationInFrames - frame));
  const at = Math.min(frame, doc.durationInFrames - 1);
  const add = (c: Clip) => ed.addClip(c, c.type === "audio" ? "audio" : c.type === "text" ? "text" : c.type === "image" || c.type === "video" || c.type === "product3d" || c.type === "phone" ? "video" : c.type === "particles" || c.type === "transition" ? "animation" : "graphic");
  const box = (w: number, h: number) => ({ x: (W - w) / 2, y: (H - h) / 2, width: w, height: h, start: at, duration: dur });

  const upload = async (files: FileList | null) => {
    setErr("");
    if (!files) return;
    if (!confirm(t.create.rights)) return;
    for (const f of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("rights", "true");
      try {
        await api("/api/media", { method: "POST", body: fd });
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    }
    reload();
  };
  const addMedia = (m: Media) => {
    const fps = doc.fps;
    if (m.kind === "audio") return add(makeClip("audio", { name: m.name, start: at, duration: Math.max(1, Math.min(doc.durationInFrames - at, Math.round((m.duration ?? 10) * fps))), in: anim("none", 0), props: { src: m.url, assetId: m.id, role: "music", volume: 0.5, fadeIn: 0.5, fadeOut: 1, trimStart: 0 } }));
    const ar = (m.width ?? 1) / (m.height ?? 1);
    const w = Math.min(W * 0.7, H * 0.6 * ar);
    const h = w / ar;
    if (m.kind === "video" || m.kind === "render") return add(makeClip("video", { name: m.name, ...box(w, h), duration: Math.max(1, Math.min(doc.durationInFrames - at, Math.round((m.duration ?? 5) * fps))), props: { src: m.url, assetId: m.id, fit: "cover", radius: 0, muted: false, volume: 1, trimStart: 0 } }));
    add(makeClip("image", { name: m.name, ...box(w, h), in: anim("zoomIn", 18, "back.out"), props: { src: m.url, assetId: m.id, fit: "contain", radius: 0 } }));
  };

  const tabs: [Tab, string][] = [["media", t.editor.media], ["texts", t.editor.texts], ["elements", t.editor.elements], ["music", t.editor.music], ["templates", t.editor.templates], ["brand", t.editor.brand], ["ai", t.editor.ai]];
  return (
    <div className="flex h-full">
      <div className="flex w-14 shrink-0 flex-col border-r border-line">
        {tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`px-1 py-3 text-[10px] ${tab === k ? "bg-accent/20 text-white" : "text-muted hover:text-white"}`}>{l}</button>)}
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto p-3 text-xs">
        {err && <p className="mb-2 text-red-300">{err}</p>}
        {tab === "media" && (
          <div className="space-y-3">
            <label className="btn-ghost w-full cursor-pointer">⇪ {t.common.upload}<input type="file" multiple accept="image/*,video/*,audio/*" className="hidden" onChange={(e) => upload(e.target.files)} /></label>
            <p className="text-[10px] text-muted">{t.media.rightsNote}</p>
            <div className="font-semibold">{t.editor.images}</div>
            <div className="grid grid-cols-3 gap-1.5">
              {media.filter((m) => m.kind === "image").map((m) => <button key={m.id} title={m.name} onClick={() => addMedia(m)} className="aspect-square overflow-hidden rounded bg-bg hover:ring-2 hover:ring-accent"><img src={m.url} alt="" className="h-full w-full object-cover" /></button>)}
            </div>
            <div className="font-semibold">{t.editor.videos}</div>
            <div className="space-y-1">{media.filter((m) => m.kind === "video" || m.kind === "render").map((m) => <button key={m.id} onClick={() => addMedia(m)} className="block w-full truncate rounded bg-bg px-2 py-1.5 text-left hover:bg-line">🎬 {m.name}</button>)}</div>
          </div>
        )}
        {tab === "texts" && (
          <div className="space-y-2">
            {[
              { l: "Headline", p: { text: "Big **headline**", fontSize: W * 0.1, fontWeight: 900 }, a: "wordsUp" },
              { l: "Kinetic", p: { text: "FAST. BOLD. **YOU.**", fontSize: W * 0.11, fontWeight: 900, uppercase: true }, a: "charsPop" },
              { l: "Subtitle", p: { text: "Supporting line of copy", fontSize: W * 0.045, fontWeight: 500 }, a: "fade" },
              { l: "Typewriter", p: { text: "Typed out, letter by letter", fontSize: W * 0.05, fontWeight: 600 }, a: "typewriter" },
              { l: "Label", p: { text: "NEW", fontSize: W * 0.04, fontWeight: 800, background: "#ef4444", padding: 16, radius: 14 }, a: "pop" },
            ].map((x) => (
              <button key={x.l} className="block w-full rounded border border-line bg-bg p-3 text-left hover:border-accent" onClick={() => add(makeClip("text", { name: x.l, ...box(W * 0.84, (x.p.fontSize as number) * 2.6), in: anim(x.a as never, 18, x.a === "charsPop" ? "back.out" : "power3.out"), out: anim("fade", 8), props: { ...x.p, highlightColor: "#22d3ee" } }))}>
                <span style={{ fontWeight: x.p.fontWeight, fontSize: x.l === "Subtitle" ? 12 : 16 }}>{x.l}</span><span className="ml-2 text-muted">{x.a}</span>
              </button>
            ))}
            <button className="block w-full rounded border border-line bg-bg p-3 text-left hover:border-accent" onClick={() => add(makeClip("button", { name: "CTA", ...box(W * 0.6, W * 0.15), in: anim("pop", 16, "back.out", true) }))}>CTA button</button>
            <button className="block w-full rounded border border-line bg-bg p-3 text-left hover:border-accent" onClick={() => add(makeClip("price", { name: "Price", ...box(W * 0.55, W * 0.18), in: anim("pop", 16, "back.out", true), props: { badge: "-25%", oldPrice: "59.99" } }))}>Price / discount tag</button>
            <button className="block w-full rounded border border-line bg-bg p-3 text-left hover:border-accent" onClick={() => add(makeClip("price", { name: "Price burst", ...box(W * 0.45, W * 0.45), in: anim("rotateIn", 18, "back.out", true), props: { style: "burst", badge: "SALE", bg: "#facc15" } }))}>Price burst</button>
          </div>
        )}
        {tab === "elements" && (
          <div className="space-y-3">
            <div className="font-semibold">{t.editor.elements}</div>
            <div className="grid grid-cols-2 gap-1.5">
              {(["rect", "circle", "blob", "ring", "line"] as const).map((s) => <button key={s} className="rounded border border-line bg-bg p-2 hover:border-accent" onClick={() => add(makeClip("shape", { name: s, ...box(W * 0.4, s === "line" ? 8 : W * 0.4), in: anim("zoomIn", 14), props: { shape: s, fill: "#7c5cff", fill2: s === "blob" ? "#22d3ee" : undefined } }))}>{s}</button>)}
              <button className="rounded border border-line bg-bg p-2 hover:border-accent" onClick={() => add(makeClip("phone", { name: "Phone", ...box(W * 0.42, W * 0.86), in: anim("slideUp", 20, "expo.out"), loop: "float" }))}>📱 Phone mockup</button>
              <button className="rounded border border-line bg-bg p-2 hover:border-accent" onClick={() => { const img = media.find((m) => m.kind === "image"); add(makeClip("product3d", { name: "3D product", ...box(W * 0.8, W * 0.8), in: anim("zoomIn", 20, "expo.out"), props: { src: img?.url ?? "", assetId: img?.id } })); }}>🧊 3D product</button>
              <button className="rounded border border-line bg-bg p-2 hover:border-accent" onClick={() => add(makeClip("logo", { name: "Logo", ...box(W * 0.5, W * 0.15), in: anim("zoomIn", 16) }))}>Logo reveal</button>
              <button className="rounded border border-line bg-bg p-2 hover:border-accent" onClick={() => add(makeClip("background", { name: "Background", start: at, duration: dur, in: anim("fade", 10) }))}>Background</button>
            </div>
            <div className="font-semibold">{t.editor.illustrations}</div>
            <div className="grid grid-cols-5 gap-1.5">
              {(["check", "star", "heart", "bolt", "arrow", "sparkle", "cart", "truck", "shield", "clock"] as const).map((k) => <button key={k} title={k} className="rounded border border-line bg-bg p-1.5 hover:border-accent" onClick={() => add(makeClip("illustration", { name: k, ...box(W * 0.2, W * 0.2), in: anim("pop", 14, "back.out", true), props: { kind: k } }))}>{k}</button>)}
            </div>
            <div className="font-semibold">Particles</div>
            <div className="grid grid-cols-3 gap-1.5">
              {(["sparkles", "confetti", "bokeh", "snow", "dots", "lines"] as const).map((k) => <button key={k} className="rounded border border-line bg-bg p-1.5 hover:border-accent" onClick={() => add(makeClip("particles", { name: k, x: 0, y: 0, width: W, height: H, start: at, duration: dur, props: { kind: k, count: k === "bokeh" ? 18 : 40, size: k === "bokeh" ? 30 : 12 } }))}>{k}</button>)}
            </div>
            <div className="font-semibold">Transitions</div>
            <div className="grid grid-cols-3 gap-1.5">
              {(["wipe", "circle", "flash", "slide", "zoomBlur", "bars"] as const).map((k) => <button key={k} className="rounded border border-line bg-bg p-1.5 hover:border-accent" onClick={() => add(makeClip("transition", { name: k, start: Math.max(0, at - 7), duration: 14, in: anim("none", 0), props: { kind: k } }))}>{k}</button>)}
            </div>
          </div>
        )}
        {tab === "music" && (
          <div className="space-y-2">
            <label className="btn-ghost w-full cursor-pointer">⇪ {t.common.upload} (mp3, wav, m4a)<input type="file" accept="audio/*" className="hidden" onChange={(e) => upload(e.target.files)} /></label>
            <p className="text-[10px] text-muted">{t.media.rightsNote}</p>
            {media.filter((m) => m.kind === "audio").map((m) => (
              <div key={m.id} className="flex items-center gap-1 rounded bg-bg p-1.5">
                <audio src={m.url} controls className="h-7 min-w-0 flex-1" preload="none" />
                <button className="btn-ghost btn-xs" onClick={() => addMedia(m)}>+</button>
              </div>
            ))}
          </div>
        )}
        {tab === "templates" && (
          <div className="space-y-1.5">
            {AD_STYLES.map((s) => (
              <button key={s.id} className={`block w-full rounded border p-2 text-left hover:border-accent ${doc.style === s.id ? "border-accent" : "border-line"}`} onClick={() => ed.replace(restyle(doc, s.id))}>
                <div className="font-semibold">{s.name[locale]}</div><div className="text-[10px] text-muted">{s.description[locale]}</div>
              </button>
            ))}
          </div>
        )}
        {tab === "brand" && <BrandTab ed={ed} kits={kits} media={media} add={add} box={box} />}
        {tab === "ai" && <AiTab ed={ed} />}
      </div>
    </div>
  );
}

function BrandTab({ ed, kits, media, add, box }: { ed: EditorApi; kits: (BrandKitData & { id: string })[]; media: Media[]; add: (c: Clip) => void; box: (w: number, h: number) => object }) {
  const { t } = useT();
  const sel = findClip(ed.doc, ed.selected)?.clip;
  const applyColor = (c: string) => {
    if (!sel) return;
    ed.updateClip(sel.id, (x) => {
      const p = x.props as unknown as Record<string, unknown>;
      for (const k of ["color", "fill", "bg", "color1"]) if (k in p) { p[k] = c; break; }
    });
  };
  if (!kits.length) return <p className="text-muted">— <Link className="text-accent2" href="/brand-kits">{t.nav.brandKits}</Link></p>;
  return (
    <div className="space-y-4">
      {kits.map((k) => (
        <div key={k.id} className="space-y-2 rounded border border-line p-2">
          <div className="font-semibold">{k.name}</div>
          <div className="flex gap-1">{Object.entries(k.colors).map(([n, c]) => <button key={n} title={`${n} ${c} → ${sel ? sel.name : "select a layer"}`} onClick={() => applyColor(c)} className="h-7 w-7 rounded border border-line" style={{ background: c }} />)}</div>
          <div className="text-[10px] text-muted">{k.fonts.heading} / {k.fonts.body}</div>
          {k.logoAssetId && <button className="btn-ghost btn-xs" onClick={() => { const m = media.find((x) => x.id === k.logoAssetId); add(makeClip("logo", { name: "Logo", ...(box(ed.doc.width * 0.4, ed.doc.width * 0.15) as object), props: { src: m?.url ?? `/api/files/${k.logoAssetId}`, assetId: k.logoAssetId, reveal: "glow" } })); }}>+ {t.kits.logo}</button>}
          <button className="btn-ghost btn-xs" onClick={() => ed.update((d) => { for (const tr of d.tracks) for (const c of tr.clips) { if (c.type === "text") c.props.fontFamily = c.props.fontSize > d.width * 0.055 ? k.fonts.heading : k.fonts.body; if (c.type === "button") c.props.bg = k.colors.primary; } d.fonts = Array.from(new Set([...d.fonts, k.fonts.heading, k.fonts.body])); })}>Apply fonts</button>
        </div>
      ))}
    </div>
  );
}

function AiTab({ ed }: { ed: EditorApi }) {
  const { t, locale } = useT();
  const [provs, setProvs] = useState<{ id: string; configured: boolean; enabled: boolean }[]>([]);
  const [provider, setProvider] = useState("");
  const [lang, setLang] = useState(ed.doc.language || locale);
  const [voice, setVoice] = useState("");
  const [sceneIdx, setSceneIdx] = useState(0);
  const [text, setText] = useState(ed.doc.scenes[0]?.voiceover ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    api<typeof provs>("/api/settings/providers").then((p) => {
      setProvs(p);
      const first = PROVIDERS.find((x) => x.categories.includes("tts") && p.some((y) => y.id === x.id && y.configured && y.enabled));
      if (first) setProvider(first.id);
    }).catch(() => {});
  }, []);
  const tts = PROVIDERS.filter((x) => x.categories.includes("tts") && provs.some((y) => y.id === x.id && y.configured && y.enabled));
  const gen = async () => {
    setBusy(true);
    setMsg("");
    try {
      const r = await api<{ assetId: string; url: string; duration: number; words: { text: string; start: number; end: number }[]; timing: "exact" | "estimated" }>(`/api/projects/x/voiceover`, { method: "POST", json: { provider, text, language: lang, voice: voice || undefined } });
      const sc = ed.doc.scenes[sceneIdx];
      const fps = ed.doc.fps;
      const start = (sc?.start ?? ed.frame) + 6;
      const dur = Math.ceil(r.duration * fps) + 2;
      const W = ed.doc.width;
      const H = ed.doc.height;
      ed.update((d) => {
        let vt = d.tracks.find((x) => x.kind === "audio" && x.name.toLowerCase().includes("voice"));
        if (!vt) { vt = { id: `trk_${Date.now()}`, name: "Voice-over", kind: "audio", clips: [], hidden: false, locked: false, muted: false }; d.tracks.push(vt); }
        vt.clips.push(makeClip("audio", { name: `VO ${sceneIdx + 1}`, start, duration: dur, in: anim("none", 0), props: { src: r.url, assetId: r.assetId, role: "voiceover", volume: 1, fadeIn: 0, fadeOut: 0, trimStart: 0, text } }));
        let ct = d.tracks.find((x) => x.kind === "caption");
        if (!ct) { ct = { id: `trk_${Date.now()}c`, name: "Subtitles", kind: "caption", clips: [], hidden: false, locked: false, muted: false }; d.tracks.splice(d.tracks.findIndex((x) => x.kind === "audio"), 0, ct); }
        ct.clips.push(makeClip("caption", { name: "Subtitles", start: sc?.start ?? start, duration: Math.max(dur + 6, sc?.duration ?? dur), x: W * 0.05, y: H > W ? H * 0.74 : H * 0.8, width: W * 0.9, height: H * 0.1, in: anim("none", 0), props: { words: r.words.map((w) => ({ text: w.text, start: start + Math.round(w.start * fps), end: start + Math.round(w.end * fps) })), timing: r.timing, fontSize: (H > W ? W : H) * 0.055, maxWordsPerLine: 4 } }));
        if (d.scenes[sceneIdx]) d.scenes[sceneIdx].voiceover = text;
        d.durationInFrames = Math.max(d.durationInFrames, start + dur);
      });
      setMsg(`✓ ${r.duration.toFixed(1)}s · subtitles ${r.timing}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const a = ed.analysis as { score: number; checks: { id: string; pass: boolean; label: { en: string; nl: string }; detail: string }[] } | undefined;
  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded border border-line p-2">
        <div className="font-semibold">🎙 {t.editor.voiceover}</div>
        {!tts.length ? <p className="text-amber-300">{t.dash.noProviders} <Link className="underline" href="/settings">{t.nav.settings}</Link></p> : (
          <>
            <select className="input py-1 text-xs" value={provider} onChange={(e) => setProvider(e.target.value)}>{tts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <div className="grid grid-cols-2 gap-1">
              <select className="input py-1 text-xs" value={lang} onChange={(e) => setLang(e.target.value)}>{LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select>
              <input className="input py-1 text-xs" placeholder={t.create.voice} value={voice} onChange={(e) => setVoice(e.target.value)} />
            </div>
            <select className="input py-1 text-xs" value={sceneIdx} onChange={(e) => { const i = +e.target.value; setSceneIdx(i); setText(ed.doc.scenes[i]?.voiceover ?? ""); }}>{ed.doc.scenes.map((s, i) => <option key={s.id} value={i}>{s.name}</option>)}</select>
            <textarea className="input h-20 text-xs" value={text} onChange={(e) => setText(e.target.value)} />
            <button className="btn-primary btn-xs w-full" disabled={busy || !text.trim() || !provider} onClick={gen}>{busy ? "…" : t.editor.voiceover}</button>
          </>
        )}
        {msg && <p className="text-[11px]">{msg}</p>}
      </div>
      <Link href="/ai-video" className="btn-ghost w-full">◉ {t.nav.aiVideo}</Link>
      {a && (
        <div className="space-y-1 rounded border border-line p-2">
          <div className="font-semibold">{t.editor.analysis}: <span className={a.score >= 75 ? "text-emerald-300" : "text-amber-300"}>{a.score}/100</span></div>
          {a.checks.map((c) => <div key={c.id}>{c.pass ? "✅" : "⚠️"} {c.label[locale]} <span className="text-muted">{c.detail}</span></div>)}
        </div>
      )}
    </div>
  );
}
