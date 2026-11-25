// "AI Motion Designer" core: deterministic layout + animation engine that turns a
// creative brief into an editable multitrack timeline. LLM agents write the brief;
// this code does the motion design so the result is always valid and editable.
import { anim, emptyProject, makeClip, makeTrack, uid } from "../../remotion/defaults";
import type { Clip, ProjectDoc, Scene, Track } from "../../remotion/types";
import type { AdBrief, ScriptScene } from "./brief";
import { darken, lighten, mix, readableOn, contrast } from "./color";
import { getStyle, type AdStyle } from "./styles";

interface Palette {
  bg1: string;
  bg2: string;
  bg3: string;
  text: string;
  accent: string;
  ctaBg: string;
  ctaText: string;
  surface: string;
}

function palette(brief: AdBrief, style: AdStyle): Palette {
  const b = brief.brand;
  let bg1: string, bg2: string, bg3: string;
  if (style.theme === "dark") {
    bg1 = darken(b.primary, 0.88);
    bg2 = style.id === "luxury" ? "#3a2f1d" : darken(b.primary, 0.55);
    bg3 = darken(b.secondary, 0.5);
  } else if (style.theme === "light") {
    bg1 = lighten(b.primary, 0.94);
    bg2 = lighten(b.secondary, 0.8);
    bg3 = lighten(b.accent, 0.75);
  } else {
    bg1 = b.primary;
    bg2 = b.secondary;
    bg3 = b.accent;
  }
  const textBase = readableOn(mix(bg1, bg2, 0.5));
  const accent = style.id === "luxury" ? "#d4af37" : contrast(b.accent, bg1) > 2.2 ? b.accent : textBase === "#ffffff" ? lighten(b.accent, 0.4) : darken(b.accent, 0.4);
  const ctaBg = style.theme === "brand" ? "#ffffff" : contrast(b.primary, bg1) > 2.5 ? b.primary : accent;
  return { bg1, bg2, bg3, text: textBase, accent, ctaBg, ctaText: readableOn(ctaBg), surface: textBase === "#ffffff" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)" };
}

interface Ctx {
  brief: AdBrief;
  style: AdStyle;
  pal: Palette;
  W: number;
  H: number;
  portrait: boolean;
  fps: number;
  head: string;
  body: string;
  tracks: Record<"bg" | "media" | "graphic" | "text" | "fx" | "caption" | "voice" | "music", Track>;
  imgIdx: number;
  usedVideo?: boolean;
}

const nextImage = (c: Ctx) => {
  const imgs = c.brief.product.images;
  if (!imgs.length) return { src: "", assetId: undefined as string | undefined };
  const i = c.imgIdx++ % imgs.length;
  return { src: imgs[i], assetId: c.brief.product.imageAssetIds?.[i] };
};

function headline(c: Ctx, text: string, start: number, dur: number, box: { x: number; y: number; w: number; h: number }, size: number, opts: Partial<{ delay: number; color: string; weight: number; align: "left" | "center" | "right"; preset: Clip["in"]["preset"]; font: string; upper: boolean }> = {}) {
  const s = c.style;
  return makeClip("text", {
    name: text.slice(0, 24),
    start: start + (opts.delay ?? 0),
    duration: dur - (opts.delay ?? 0),
    x: box.x, y: box.y, width: box.w, height: box.h,
    in: anim(opts.preset ?? s.textIn, Math.round(18 / s.pace), s.textEasing, s.textIn === "pop"),
    out: anim("fade", 8, "power2.in"),
    props: {
      text, fontFamily: opts.font ?? c.head, fontSize: size, fontWeight: opts.weight ?? s.headingWeight, color: opts.color ?? c.pal.text,
      align: opts.align ?? (c.portrait ? "center" : "left"), lineHeight: 1.08, letterSpacing: s.letterSpacing, uppercase: opts.upper ?? s.uppercase,
      highlightColor: c.pal.accent,
    },
  });
}

function productVisual(c: Ctx, start: number, dur: number, box: { x: number; y: number; w: number; h: number }, allowVideo = false): Clip[] {
  const s = c.style;
  const hv = c.brief.product.heroVideo;
  if (allowVideo && hv && !c.usedVideo) {
    c.usedVideo = true;
    return [makeClip("video", { name: "Product video", start, duration: dur, x: box.x, y: box.y, width: box.w, height: box.h, in: anim("zoomIn", 14, "expo.out"), out: anim("fade", 8), shadow: { enabled: true, color: "rgba(0,0,0,0.35)", blur: 40, x: 0, y: 24 }, props: { src: hv.src, assetId: hv.assetId, fit: "cover", radius: Math.round(c.W * 0.04), muted: true, volume: 0, trimStart: 0 } })];
  }
  const img = nextImage(c);
  if (s.productPresentation === "3d") {
    return [makeClip("product3d", { name: "3D product", start, duration: dur, x: box.x, y: box.y, width: box.w, height: box.h, in: anim("zoomIn", 20, "expo.out"), props: { src: img.src, assetId: img.assetId, shape: "card", envColor: c.pal.accent, color: c.brief.brand.primary } })];
  }
  if (s.productPresentation === "phone") {
    const pw = Math.min(box.w, box.h * 0.5);
    const ph = pw * 2.05;
    return [makeClip("phone", { name: "Phone mockup", start, duration: dur, x: box.x + (box.w - pw) / 2, y: box.y + (box.h - ph) / 2, width: pw, height: ph, in: anim("slideUp", 22, "expo.out"), loop: "float", loopIntensity: 0.6, props: { src: img.src, assetId: img.assetId } })];
  }
  return [
    makeClip("image", {
      name: "Product", start, duration: dur, x: box.x, y: box.y, width: box.w, height: box.h,
      in: anim(s.mediaIn, Math.round(20 / s.pace), "back.out", s.mediaIn === "pop"), out: anim("fade", 8),
      loop: s.mediaLoop, loopIntensity: s.mediaLoop === "shake" ? 0.4 : 1,
      shadow: { enabled: true, color: "rgba(0,0,0,0.35)", blur: 50, x: 0, y: 30 },
      props: { src: img.src, assetId: img.assetId, fit: "contain", radius: 0, floorShadow: c.style.theme !== "light" },
    }),
  ];
}

function sceneClips(c: Ctx, sc: ScriptScene, start: number, dur: number, index: number): Clip[] {
  const { W, H, portrait, pal, style: s, brief } = c;
  const out: Clip[] = [];
  const m = W * 0.08;
  const big = portrait ? W * 0.11 : H * 0.11;
  const mid = portrait ? W * 0.065 : H * 0.065;
  const small = portrait ? W * 0.045 : H * 0.045;
  const textBox = portrait ? { x: m, y: H * 0.1, w: W - 2 * m, h: H * 0.25 } : { x: m, y: H * 0.22, w: W * 0.46, h: H * 0.4 };
  const subBox = portrait ? { x: m, y: H * 0.34, w: W - 2 * m, h: H * 0.08 } : { x: m, y: H * 0.62, w: W * 0.46, h: H * 0.14 };
  const mediaBox = portrait ? { x: W * 0.12, y: H * 0.42, w: W * 0.76, h: H * 0.42 } : { x: W * 0.54, y: H * 0.12, w: W * 0.4, h: H * 0.76 };

  switch (sc.kind) {
    case "hook": {
      const centerBox = { x: m, y: H * 0.28, w: W - 2 * m, h: H * 0.36 };
      out.push(headline(c, sc.onScreenText, start, dur, centerBox, big * 1.15, { align: "center" }));
      if (sc.subText) out.push(headline(c, sc.subText, start, dur, { x: m, y: H * 0.64, w: W - 2 * m, h: H * 0.1 }, small, { delay: 10, weight: 500, font: c.body, upper: false, preset: "fade", align: "center" }));
      out.push(makeClip("shape", { name: "Accent blob", start, duration: dur, x: W * 0.55, y: H * 0.05, width: W * 0.6, height: W * 0.6, opacity: 0.25, in: anim("zoomIn", 30, "expo.out"), loop: "float", props: { shape: "blob", fill: pal.accent, fill2: brief.brand.secondary } }));
      break;
    }
    case "product":
    case "solution": {
      out.push(headline(c, sc.onScreenText, start, dur, textBox, mid * 1.2));
      if (sc.subText) out.push(headline(c, sc.subText, start, dur, subBox, small, { delay: 8, weight: 500, font: c.body, upper: false, preset: "fade" }));
      out.push(...productVisual(c, start, dur, mediaBox, sc.kind === "product"));
      if (brief.product.logo && sc.kind === "product") {
        out.push(makeClip("logo", { name: "Logo", start: start + 6, duration: dur - 6, x: portrait ? W / 2 - W * 0.15 : m, y: portrait ? H * 0.88 : H * 0.84, width: W * 0.3, height: H * 0.06, in: anim("fade", 12), props: { src: brief.product.logo, assetId: brief.product.logoAssetId, reveal: "scale", color: pal.text } }));
      }
      break;
    }
    case "problem":
    case "before": {
      out.push(makeClip("shape", { name: "Dim overlay", start, duration: dur, x: 0, y: 0, width: W, height: H, opacity: 0.55, in: anim("fade", 10), props: { shape: "rect", fill: "#000000", radius: 0 } }));
      if (sc.kind === "before") {
        out.push(...productVisual(c, start, dur, mediaBox).map((cl) => ({ ...cl, opacity: 0.5 })));
        out.push(makeClip("text", { name: "Label", start, duration: dur, x: m, y: H * 0.05, width: W * 0.4, height: H * 0.06, in: anim("slideRight", 12), props: { text: brief.language === "nl" ? "VOOR" : "BEFORE", fontFamily: c.head, fontSize: small, fontWeight: 900, color: "#ffffff", background: "#ef4444", padding: 12, radius: 12, align: "center" } }));
      }
      out.push(headline(c, sc.onScreenText, start, dur, portrait ? { x: m, y: H * 0.15, w: W - 2 * m, h: H * 0.25 } : textBox, mid * 1.15, { color: "#ffffff" }));
      out.push(makeClip("illustration", { name: "Icon", start: start + 8, duration: dur - 8, x: portrait ? W / 2 - W * 0.08 : m, y: portrait ? H * 0.42 : H * 0.08, width: W * 0.16, height: W * 0.16, in: anim("pop", 14, "back.out", true), props: { kind: "clock", color: "#f87171", color2: "#fb923c" } }));
      break;
    }
    case "after": {
      out.push(makeClip("text", { name: "Label", start, duration: dur, x: m, y: H * 0.05, width: W * 0.4, height: H * 0.06, in: anim("slideRight", 12), props: { text: brief.language === "nl" ? "NA" : "AFTER", fontFamily: c.head, fontSize: small, fontWeight: 900, color: "#ffffff", background: "#22c55e", padding: 12, radius: 12, align: "center" } }));
      out.push(headline(c, sc.onScreenText, start, dur, textBox, mid * 1.15));
      out.push(...productVisual(c, start, dur, mediaBox));
      out.push(makeClip("particles", { name: "Sparkles", start, duration: dur, x: 0, y: 0, width: W, height: H, in: anim("fade", 10), props: { kind: "sparkles", count: 30, color: "#ffffff", color2: pal.accent, seed: index } }));
      break;
    }
    case "feature":
    case "benefit": {
      out.push(headline(c, sc.onScreenText, start, dur, portrait ? { x: m, y: H * 0.08, w: W - 2 * m, h: H * 0.16 } : { x: m, y: H * 0.08, w: W * 0.5, h: H * 0.2 }, mid));
      const items = (sc.kind === "benefit" ? brief.copy.benefits : brief.product.features.length ? brief.product.features : brief.copy.benefits).slice(0, 3);
      const icons = ["check", "bolt", "star"] as const;
      const listX = portrait ? m : m;
      const listY0 = portrait ? H * 0.28 : H * 0.34;
      const rowH = portrait ? H * 0.11 : H * 0.17;
      const listW = portrait ? W - 2 * m : W * 0.48;
      items.forEach((item, i) => {
        const d = 10 + i * Math.round(10 / s.pace);
        out.push(makeClip("shape", { name: `Row ${i + 1}`, start: start + d, duration: dur - d, x: listX, y: listY0 + i * rowH, width: listW, height: rowH * 0.82, in: anim("slideRight", 14, "power3.out"), props: { shape: "rect", fill: pal.surface, radius: 28 } }));
        out.push(makeClip("illustration", { name: `Icon ${i + 1}`, start: start + d + 4, duration: dur - d - 4, x: listX + rowH * 0.15, y: listY0 + i * rowH + rowH * 0.13, width: rowH * 0.56, height: rowH * 0.56, in: anim("pop", 12, "back.out", true), props: { kind: icons[i], color: pal.accent, color2: brief.brand.secondary } }));
        out.push(makeClip("text", { name: item.slice(0, 20), start: start + d + 4, duration: dur - d - 4, x: listX + rowH * 0.85, y: listY0 + i * rowH, width: listW - rowH * 1.0, height: rowH * 0.82, in: anim("slideLeft", 14, "power3.out"), props: { text: item, fontFamily: c.body, fontSize: small * 0.95, fontWeight: 700, color: pal.text, align: "left", lineHeight: 1.15, letterSpacing: 0, uppercase: false } }));
      });
      if (!portrait) out.push(...productVisual(c, start, dur, mediaBox));
      else out.push(...productVisual(c, start, dur, { x: W * 0.25, y: H * 0.64, w: W * 0.5, h: H * 0.3 }));
      break;
    }
    case "price": {
      out.push(headline(c, sc.onScreenText, start, dur, portrait ? { x: m, y: H * 0.08, w: W - 2 * m, h: H * 0.18 } : textBox, mid * 1.1));
      out.push(...productVisual(c, start, dur, portrait ? { x: W * 0.1, y: H * 0.26, w: W * 0.8, h: H * 0.4 } : { x: W * 0.52, y: H * 0.1, w: W * 0.42, h: H * 0.8 }));
      if (brief.product.price) {
        const pw = portrait ? W * 0.62 : W * 0.3;
        const ph = s.priceStyle === "burst" ? pw : pw * 0.32;
        out.push(makeClip("price", {
          name: "Price", start: start + 8, duration: dur - 8,
          x: portrait ? (W - pw) / 2 : m, y: portrait ? H * 0.7 : H * 0.6, width: pw, height: ph,
          in: anim("pop", 16, "back.out", true), loop: "pulse", loopIntensity: 0.5,
          props: { price: brief.product.price, oldPrice: brief.product.oldPrice, currency: brief.product.currency ?? "€", badge: brief.copy.badge, bg: s.theme === "light" ? brief.brand.primary : "#ffffff", color: s.theme === "light" ? readableOn(brief.brand.primary) : "#111111", accent: "#ef4444", fontFamily: c.head, style: s.priceStyle },
        }));
      }
      if (s.particles === "confetti") out.push(makeClip("particles", { name: "Confetti", start: start + 8, duration: dur - 8, x: 0, y: 0, width: W, height: H, in: anim("fade", 6), props: { kind: "confetti", count: 60, color: pal.accent, color2: brief.brand.secondary, seed: index } }));
      break;
    }
    case "social": {
      const r = brief.product.rating;
      out.push(headline(c, sc.onScreenText, start, dur, { x: m, y: H * 0.3, w: W - 2 * m, h: H * 0.2 }, mid, { align: "center" }));
      if (r) {
        for (let i = 0; i < 5; i++) {
          const sz = portrait ? W * 0.12 : H * 0.12;
          out.push(makeClip("illustration", { name: `Star ${i + 1}`, start: start + 6 + i * 4, duration: dur - 6 - i * 4, x: W / 2 - sz * 2.75 + i * sz * 1.1, y: H * 0.55, width: sz, height: sz, in: anim("pop", 12, "back.out", true), props: { kind: "star", color: "#facc15", color2: "#f59e0b", draw: false, strokeWidth: 2 } }));
        }
      }
      break;
    }
    case "cta":
    case "logo": {
      const bw = portrait ? W * 0.7 : W * 0.34;
      const bh = bw * 0.24;
      out.push(headline(c, sc.onScreenText, start, dur, { x: m, y: portrait ? H * 0.16 : H * 0.14, w: W - 2 * m, h: portrait ? H * 0.22 : H * 0.28 }, mid * 1.2, { align: "center" }));
      if (brief.product.images.length) out.push(...productVisual(c, start, dur, portrait ? { x: W * 0.2, y: H * 0.38, w: W * 0.6, h: H * 0.3 } : { x: W * 0.36, y: H * 0.42, w: W * 0.28, h: H * 0.32 }));
      out.push(makeClip("button", { name: "CTA button", start: start + 10, duration: dur - 10, x: (W - bw) / 2, y: portrait ? H * 0.72 : H * 0.76, width: bw, height: bh, in: anim("pop", 16, "back.out", true), props: { label: brief.copy.cta, bg: pal.ctaBg, color: pal.ctaText, fontFamily: c.head, fontSize: bh * 0.36, icon: brief.product.price ? "cart" : "arrow" } }));
      const host = brief.product.url ? safeHost(brief.product.url) : "";
      if (host) out.push(makeClip("text", { name: "URL", start: start + 16, duration: dur - 16, x: m, y: portrait ? H * 0.84 : H * 0.9, width: W - 2 * m, height: H * 0.05, in: anim("fade", 12), props: { text: host, fontFamily: c.body, fontSize: small * 0.8, fontWeight: 600, color: pal.text, align: "center", lineHeight: 1, letterSpacing: 1, uppercase: false } }));
      if (brief.product.logo) out.push(makeClip("logo", { name: "Logo", start: start + 4, duration: dur - 4, x: W / 2 - W * 0.15, y: portrait ? H * 0.05 : H * 0.03, width: W * 0.3, height: H * 0.08, in: anim("zoomIn", 16), props: { src: brief.product.logo, assetId: brief.product.logoAssetId, reveal: "glow", color: pal.accent } }));
      else out.push(makeClip("logo", { name: "Brand", start: start + 4, duration: dur - 4, x: W / 2 - W * 0.3, y: portrait ? H * 0.05 : H * 0.03, width: W * 0.6, height: H * 0.07, in: anim("fade", 16), props: { text: brief.product.brandName || brief.product.name, color: pal.text, fontFamily: c.head, reveal: "scale" } }));
      break;
    }
  }
  return out;
}

function safeHost(u: string) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Estimate per-word timings for on-screen subtitles when no TTS timestamps exist. */
export function estimateWords(text: string, startFrame: number, durFrames: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const total = words.reduce((a, w) => a + w.length + 2, 0) || 1;
  let t = startFrame + 4;
  const usable = Math.max(1, durFrames - 8);
  return words.map((w) => {
    const len = ((w.length + 2) / total) * usable;
    const word = { text: w, start: Math.round(t), end: Math.round(t + len) };
    t += len;
    return word;
  });
}

export function buildProject(brief: AdBrief): ProjectDoc {
  const style = getStyle(brief.style);
  const doc = emptyProject(brief.aspect, brief.seconds, `${brief.product.name} — ${brief.variantLabel}`);
  const W = doc.width;
  const H = doc.height;
  const fps = doc.fps;
  const pal = palette(brief, style);
  const head = brief.brand.headingFont || style.headingFont;
  const body = brief.brand.bodyFont || style.bodyFont;
  doc.style = style.id;
  doc.language = brief.language;
  doc.backgroundColor = pal.bg1;
  doc.fonts = Array.from(new Set([head, body, "Inter"]));
  doc.meta = { source: brief.product.url, productName: brief.product.name, variantLabel: brief.variantLabel, hook: brief.copy.hook };

  const tracks = {
    bg: makeTrack("video", "Background"),
    media: makeTrack("video", "Product media"),
    graphic: makeTrack("graphic", "Graphics"),
    text: makeTrack("text", "Text"),
    fx: makeTrack("animation", "FX & transitions"),
    caption: makeTrack("caption", "Subtitles"),
    voice: makeTrack("audio", "Voice-over"),
    music: makeTrack("audio", "Music"),
  };
  const ctx: Ctx = { brief, style, pal, W, H, portrait: H / W > 1.15, fps, head, body, tracks, imgIdx: 0 };

  // Scenes: scale weights to total duration (hook kept short for retention)
  let scenes = brief.scenes.filter((s) => s.kind !== "social" || brief.product.rating);
  if (brief.seconds <= 6) scenes = [scenes.find((s) => s.kind === "hook"), scenes.find((s) => s.kind === "product"), scenes.find((s) => s.kind === "cta")].filter(Boolean) as ScriptScene[];
  if (!scenes.length) scenes = [{ kind: "hook", weight: 1, onScreenText: brief.copy.hook, voiceover: brief.copy.hook }, { kind: "cta", weight: 1, onScreenText: brief.copy.cta, voiceover: brief.copy.cta }];
  const totalW = scenes.reduce((a, s) => a + Math.max(0.3, s.weight), 0);
  const total = doc.durationInFrames;
  let cursor = 0;
  const docScenes: Scene[] = [];
  scenes.forEach((sc, i) => {
    const dur = i === scenes.length - 1 ? total - cursor : Math.round((Math.max(0.3, sc.weight) / totalW) * total);
    docScenes.push({ id: uid("scn"), name: `${i + 1}. ${sc.kind}`, start: cursor, duration: dur, voiceover: sc.voiceover });
    for (const clip of sceneClips(ctx, sc, cursor, dur, i)) {
      const t = clip.type === "text" ? tracks.text : clip.type === "image" || clip.type === "product3d" || clip.type === "phone" ? tracks.media : clip.type === "particles" ? tracks.fx : tracks.graphic;
      t.clips.push(clip);
    }
    if (brief.scriptCaptions && style.captionStyle !== "none" && sc.voiceover) {
      tracks.caption.clips.push(captionClip(ctx, estimateWords(sc.voiceover, cursor, dur), cursor, dur, "estimated"));
    }
    cursor += dur;
  });
  doc.scenes = docScenes;

  // Background spanning the whole ad
  tracks.bg.clips.push(makeClip("background", { name: "Background", start: 0, duration: total, in: anim("none", 0), props: { kind: style.bg, color1: pal.bg1, color2: pal.bg2, color3: pal.bg3, angle: 160, animate: true } }));
  if (style.particles && style.particles !== "confetti") {
    tracks.bg.clips.push(makeClip("particles", { name: "Ambient particles", start: 0, duration: total, x: 0, y: 0, width: W, height: H, opacity: 0.7, in: anim("fade", 20), props: { kind: style.particles, count: style.particles === "bokeh" ? 18 : 36, color: lighten(pal.accent, 0.3), color2: pal.text, size: style.particles === "bokeh" ? 30 : 10, speed: 0.6 } }));
  }
  if (style.id === "cinematic") {
    for (const y of [0, H - H * 0.08]) tracks.fx.clips.push(makeClip("shape", { name: "Letterbox", start: 0, duration: total, x: 0, y, width: W, height: H * 0.08, in: anim("none", 0), props: { shape: "rect", fill: "#000000", radius: 0 } }));
  }
  // Scene transitions
  if (style.transition) {
    docScenes.slice(1).forEach((sc, i) => {
      const len = Math.round(14 / style.pace);
      tracks.fx.clips.push(makeClip("transition", { name: `Transition ${i + 1}`, start: Math.max(0, sc.start - Math.floor(len / 2)), duration: len, in: anim("none", 0), props: { kind: style.transition!, color: i % 2 ? pal.accent : pal.text, direction: i % 2 ? "right" : "left" } }));
    });
  }
  doc.tracks = packTracks([tracks.bg, tracks.media, tracks.graphic, tracks.text, tracks.fx, tracks.caption, tracks.voice, tracks.music]);
  return doc;
}

/** Splits overlapping clips of one track into extra lanes so every clip stays editable. */
export function packTracks(tracks: Track[]): Track[] {
  const out: Track[] = [];
  for (const t of tracks) {
    const lanes: Track[] = [];
    for (const c of [...t.clips].sort((a, b) => a.start - b.start)) {
      let lane = lanes.find((l) => l.clips.every((o) => o.start + o.duration <= c.start || c.start + c.duration <= o.start));
      if (!lane) {
        lane = { ...t, id: lanes.length ? uid("trk") : t.id, name: lanes.length ? `${t.name} ${lanes.length + 1}` : t.name, clips: [] };
        lanes.push(lane);
      }
      lane.clips.push(c);
    }
    out.push(...(lanes.length ? lanes : [t]));
  }
  return out;
}

export function captionClip(c: { W: number; H: number; portrait: boolean; body?: string; style: AdStyle; pal: { text: string; accent: string } }, words: { text: string; start: number; end: number }[], start: number, dur: number, timing: "exact" | "estimated") {
  const { W, H, portrait } = c;
  const bold = c.style.captionStyle === "bold";
  return makeClip("caption", {
    name: "Subtitles",
    start,
    duration: dur,
    x: W * 0.05,
    y: portrait ? H * 0.74 : H * 0.8,
    width: W * 0.9,
    height: H * 0.1,
    in: anim("none", 0),
    props: {
      words, timing, fontFamily: c.body ?? "Inter", fontSize: (portrait ? W : H) * (bold ? 0.06 : 0.045),
      color: "#ffffff", activeColor: bold ? "#facc15" : "#ffffff", background: bold ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.4)", maxWordsPerLine: bold ? 3 : 6,
    },
  });
}

export { palette };
