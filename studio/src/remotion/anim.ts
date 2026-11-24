import { gsap } from "gsap";
import { spring } from "remotion";
import type { AnimSpec, Clip, EasingName, KeyframeProp, LoopPreset } from "./types";

const easeCache = new Map<string, (t: number) => number>();

/** Resolve a GSAP ease name to a pure (t)=>t function. Used for keyframes and presets. */
export function ease(name: EasingName | string): (t: number) => number {
  let fn = easeCache.get(name);
  if (!fn) {
    const parsed = gsap.parseEase(name) as ((t: number) => number) | undefined;
    fn = parsed ?? ((t: number) => t);
    easeCache.set(name, fn);
  }
  return fn;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export interface Transform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  width: number;
  height: number;
  blur: number;
  rotateY: number;
  /** 0..1 progress for text reveal presets (typewriter, wordsUp, ...) */
  reveal: number;
  clip: number; // 0..1 mask reveal
}

/** Interpolate keyframes for one property at a local frame. */
export function keyframeValue(clip: Clip, prop: KeyframeProp, local: number, base: number): number {
  const kfs = clip.keyframes.filter((k) => k.prop === prop).sort((a, b) => a.frame - b.frame);
  if (kfs.length === 0) return base;
  if (local <= kfs[0].frame) return kfs[0].value;
  const last = kfs[kfs.length - 1];
  if (local >= last.frame) return last.value;
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (local >= a.frame && local <= b.frame) {
      const span = Math.max(1, b.frame - a.frame);
      const t = ease(b.easing)((local - a.frame) / span);
      return a.value + (b.value - a.value) * t;
    }
  }
  return base;
}

function progress(spec: AnimSpec, f: number, fps: number): number {
  if (spec.preset === "none" || spec.durationFrames <= 0) return 1;
  if (spec.spring) {
    return spring({ frame: f, fps, config: { damping: 12, stiffness: 120, mass: 0.8 }, durationInFrames: spec.durationFrames });
  }
  return ease(spec.easing)(clamp01(f / spec.durationFrames));
}

/** Apply an in/out preset. p = 0 (hidden) .. 1 (fully visible). */
function applyPreset(t: Transform, preset: AnimSpec["preset"], p: number, w: number, h: number) {
  const inv = 1 - p;
  switch (preset) {
    case "fade":
      t.opacity *= p;
      break;
    case "slideUp":
      t.y += inv * h * 0.35 + inv * 80;
      t.opacity *= clamp01(p * 1.6);
      break;
    case "slideDown":
      t.y -= inv * h * 0.35 + inv * 80;
      t.opacity *= clamp01(p * 1.6);
      break;
    case "slideLeft":
      t.x += inv * (w * 0.5 + 120);
      t.opacity *= clamp01(p * 1.6);
      break;
    case "slideRight":
      t.x -= inv * (w * 0.5 + 120);
      t.opacity *= clamp01(p * 1.6);
      break;
    case "zoomIn":
      t.scale *= 0.6 + 0.4 * p;
      t.opacity *= clamp01(p * 1.5);
      break;
    case "zoomOut":
      t.scale *= 1 + 0.5 * inv;
      t.opacity *= clamp01(p * 1.5);
      break;
    case "pop":
      t.scale *= Math.max(0, p);
      t.opacity *= clamp01(p * 3);
      break;
    case "blur":
      t.blur += inv * 30;
      t.opacity *= clamp01(p * 1.3);
      t.scale *= 1 + inv * 0.08;
      break;
    case "rotateIn":
      t.rotation += inv * -25;
      t.scale *= 0.7 + 0.3 * p;
      t.opacity *= clamp01(p * 1.5);
      break;
    case "flip3d":
      t.rotateY += inv * 90;
      t.opacity *= clamp01(p * 2);
      break;
    case "typewriter":
    case "wordsUp":
    case "charsPop":
      t.reveal = Math.min(t.reveal, p);
      break;
    case "maskReveal":
      t.clip = Math.min(t.clip, p);
      break;
    default:
      break;
  }
}

function applyLoop(t: Transform, loop: LoopPreset, intensity: number, local: number, fps: number) {
  const s = local / fps;
  const k = intensity;
  switch (loop) {
    case "float":
      t.y += Math.sin(s * 2.2) * 14 * k;
      t.rotation += Math.sin(s * 1.4) * 1.5 * k;
      break;
    case "pulse":
      t.scale *= 1 + Math.sin(s * 6) * 0.04 * k;
      break;
    case "kenBurns":
      t.scale *= 1 + s * 0.035 * k;
      t.x += s * 6 * k;
      break;
    case "parallax":
      t.x += -s * 22 * k;
      t.y += -s * 6 * k;
      break;
    case "spin":
      t.rotation += s * 90 * k;
      break;
    case "shake":
      t.x += Math.sin(s * 40) * 4 * k;
      t.rotation += Math.sin(s * 33) * 0.8 * k;
      break;
    case "wiggle":
      t.rotation += Math.sin(s * 8) * 4 * k;
      break;
    default:
      break;
  }
}

/** Full transform of a clip at an absolute timeline frame. */
export function computeTransform(clip: Clip, frame: number, fps: number): Transform {
  const local = frame - clip.start;
  const t: Transform = {
    x: keyframeValue(clip, "x", local, clip.x),
    y: keyframeValue(clip, "y", local, clip.y),
    scale: keyframeValue(clip, "scale", local, clip.scale),
    rotation: keyframeValue(clip, "rotation", local, clip.rotation),
    opacity: keyframeValue(clip, "opacity", local, clip.opacity),
    width: keyframeValue(clip, "width", local, clip.width),
    height: keyframeValue(clip, "height", local, clip.height),
    blur: 0,
    rotateY: 0,
    reveal: 1,
    clip: 1,
  };
  const pin = progress(clip.in, local, fps);
  applyPreset(t, clip.in.preset, pin, t.width, t.height);
  const outStart = clip.duration - clip.out.durationFrames;
  if (clip.out.preset !== "none" && local >= outStart) {
    const pout = 1 - ease(clip.out.easing)(clamp01((local - outStart) / Math.max(1, clip.out.durationFrames)));
    applyPreset(t, clip.out.preset, pout, t.width, t.height);
  }
  applyLoop(t, clip.loop, clip.loopIntensity, local, fps);
  return t;
}
