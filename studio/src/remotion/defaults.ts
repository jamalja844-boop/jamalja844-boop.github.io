import { ASPECT_SIZES } from "./types";
import type { AnimSpec, AspectRatio, Clip, ClipType, ProjectDoc, Track, TrackKind } from "./types";

export const uid = (p = "id") => `${p}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;

export const anim = (preset: AnimSpec["preset"] = "fade", durationFrames = 15, easing: AnimSpec["easing"] = "power3.out", spring = false): AnimSpec => ({
  preset, durationFrames, easing, spring,
});

const DEFAULT_PROPS: { [K in ClipType]: Extract<Clip, { type: K }>["props"] } = {
  text: { text: "Your headline", fontFamily: "Inter", fontSize: 96, fontWeight: 800, color: "#ffffff", align: "center", lineHeight: 1.1, letterSpacing: 0, uppercase: false },
  image: { src: "", fit: "contain", radius: 0 },
  video: { src: "", fit: "cover", radius: 0, trimStart: 0, volume: 1, muted: true },
  shape: { shape: "rect", fill: "#7c5cff", radius: 24 },
  button: { label: "Shop now", bg: "#ffffff", color: "#111111", fontFamily: "Inter", fontSize: 56, radius: 999, pulse: true, shine: true, icon: "arrow" },
  price: { price: "49.99", currency: "€", oldPrice: "", badge: "", bg: "#ffffff", color: "#111111", accent: "#ef4444", fontFamily: "Inter", style: "tag", countUp: true },
  phone: { src: "", frameColor: "#111318", scroll: true, notch: true, screenBg: "#ffffff" },
  particles: { kind: "sparkles", count: 40, color: "#ffffff", color2: "#ffd166", speed: 1, size: 14, seed: 1 },
  background: { kind: "linear", color1: "#0f172a", color2: "#7c5cff", color3: "#22d3ee", angle: 160, animate: true },
  product3d: { src: "", shape: "card", color: "#dddddd", rotationSpeed: 0.8, tilt: 0.15, envColor: "#7c5cff" },
  logo: { text: "BRAND", color: "#ffffff", fontFamily: "Inter", reveal: "scale" },
  illustration: { kind: "check", color: "#22c55e", color2: "#a3e635", strokeWidth: 2.5, draw: true },
  transition: { kind: "wipe", color: "#ffffff", direction: "left" },
  caption: { words: [], fontFamily: "Inter", fontSize: 64, color: "#ffffff", activeColor: "#facc15", background: "rgba(0,0,0,0.55)", maxWordsPerLine: 4, timing: "estimated" },
  audio: { src: "", volume: 1, fadeIn: 0, fadeOut: 0, trimStart: 0, role: "music" },
};

export const TRACK_FOR: Record<ClipType, TrackKind> = {
  background: "video", image: "video", video: "video", product3d: "video", phone: "video",
  shape: "graphic", particles: "animation", illustration: "graphic", logo: "graphic", price: "graphic", button: "graphic",
  text: "text", caption: "caption", transition: "animation", audio: "audio",
};

export function makeClip<T extends ClipType>(
  type: T,
  base: Partial<Omit<Extract<Clip, { type: T }>, "props" | "type">> & { props?: Partial<Extract<Clip, { type: T }>["props"]> },
): Extract<Clip, { type: T }> {
  const { props, ...rest } = base;
  return {
    id: uid("clip"),
    type,
    name: type,
    start: 0,
    duration: 90,
    x: 0,
    y: 0,
    width: 400,
    height: 200,
    rotation: 0,
    scale: 1,
    opacity: 1,
    in: anim("fade", 12),
    out: anim("none", 0),
    loop: "none",
    loopIntensity: 1,
    keyframes: [],
    shadow: { enabled: false, color: "rgba(0,0,0,0.5)", blur: 30, x: 0, y: 16 },
    ...rest,
    props: { ...DEFAULT_PROPS[type], ...(props ?? {}) },
  } as unknown as Extract<Clip, { type: T }>;
}

export function makeTrack(kind: TrackKind, name?: string): Track {
  return { id: uid("trk"), name: name ?? kind, kind, clips: [], hidden: false, locked: false, muted: false };
}

export function emptyProject(aspect: AspectRatio, seconds: number, name = "Untitled ad"): ProjectDoc {
  const { width, height } = ASPECT_SIZES[aspect];
  const fps = 30;
  return {
    version: 1,
    name,
    aspect,
    width,
    height,
    fps,
    durationInFrames: seconds * fps,
    style: "motion",
    language: "en",
    backgroundColor: "#000000",
    fonts: ["Inter"],
    scenes: [{ id: uid("scn"), name: "Scene 1", start: 0, duration: seconds * fps }],
    tracks: [makeTrack("video", "Background"), makeTrack("graphic", "Graphics"), makeTrack("text", "Text"), makeTrack("audio", "Audio")],
  };
}
