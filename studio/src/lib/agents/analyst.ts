// AI Advertisement Analyst — deterministic checks on the actual timeline.
import type { Clip, ProjectDoc } from "../../remotion/types";
import { contrast } from "../engine/color";

export interface Check {
  id: string;
  label: { en: string; nl: string };
  pass: boolean;
  weight: number;
  detail: string;
}

export interface Analysis {
  score: number;
  checks: Check[];
  analyzedAt: string;
}

const all = (d: ProjectDoc) => d.tracks.filter((t) => !t.hidden).flatMap((t) => t.clips);
const words = (s: string) => s.replace(/\*\*/g, "").split(/\s+/).filter(Boolean).length;

export function analyzeProject(doc: ProjectDoc): Analysis {
  const clips = all(doc);
  const fps = doc.fps;
  const total = doc.durationInFrames;
  const texts = clips.filter((c): c is Extract<Clip, { type: "text" }> => c.type === "text");
  const bg = clips.find((c): c is Extract<Clip, { type: "background" }> => c.type === "background");
  const bgColor = bg?.props.color1 ?? doc.backgroundColor;
  const checks: Check[] = [];
  const add = (id: string, en: string, nl: string, pass: boolean, weight: number, detail: string) => checks.push({ id, label: { en, nl }, pass, weight, detail });

  const firstText = texts.slice().sort((a, b) => a.start - b.start)[0];
  add("hook-timing", "Hook appears within 1 second", "Hook verschijnt binnen 1 seconde", !!firstText && firstText.start <= fps, 15, firstText ? `First text at ${(firstText.start / fps).toFixed(2)}s` : "No text found");
  const hookWords = firstText ? words(firstText.props.text) : 0;
  add("hook-length", "Hook is short (≤ 8 words)", "Hook is kort (≤ 8 woorden)", hookWords > 0 && hookWords <= 8, 10, `${hookWords} words`);

  const cta = clips.find((c) => c.type === "button");
  add("cta", "Call-to-action in the final part", "Call-to-action in het laatste deel", !!cta && cta.start + cta.duration >= total * 0.9, 15, cta ? `CTA "${(cta as Extract<Clip, { type: "button" }>).props.label}"` : "No CTA button");

  const product = clips.filter((c) => ["image", "video", "product3d", "phone"].includes(c.type));
  const covered = new Set<number>();
  product.forEach((c) => { for (let f = c.start; f < c.start + c.duration; f += 5) covered.add(f); });
  const coverage = (covered.size * 5) / Math.max(1, total);
  add("product-visible", "Product visible ≥ 50% of the time", "Product ≥ 50% van de tijd zichtbaar", coverage >= 0.5, 10, `${Math.round(Math.min(1, coverage) * 100)}%`);

  const low = texts.filter((t) => contrast(t.props.color, t.props.background && t.props.background.startsWith("#") ? t.props.background : bgColor) < 3);
  add("contrast", "Text contrast (WCAG ≥ 3:1 for large text)", "Tekstcontrast (WCAG ≥ 3:1 voor grote tekst)", low.length === 0, 15, low.length ? `${low.length} text layer(s) with low contrast` : "All text layers readable");

  const fast = texts.filter((t) => words(t.props.text) / Math.max(0.5, t.duration / fps) > 3.2);
  add("reading-speed", "Readable pace (≤ 3 words/sec)", "Leesbaar tempo (≤ 3 woorden/sec)", fast.length === 0, 10, fast.length ? `${fast.length} layer(s) too fast` : "OK");

  if (doc.aspect === "9:16") {
    const unsafe = texts.filter((t) => t.y + t.height > doc.height * 0.86 || t.x + t.width > doc.width * 0.97);
    add("safe-zone", "Text inside social safe zone", "Tekst binnen de social safe zone", unsafe.length === 0, 10, unsafe.length ? `${unsafe.length} layer(s) may be covered by app UI` : "OK");
  }
  const hasCaptions = clips.some((c) => c.type === "caption");
  const hasVoice = clips.some((c) => c.type === "audio" && (c as Extract<Clip, { type: "audio" }>).props.role === "voiceover");
  add("sound-off", "Works with sound off (subtitles)", "Werkt zonder geluid (ondertiteling)", hasCaptions || !hasVoice, 5, hasCaptions ? "Subtitles present" : hasVoice ? "Voice-over without subtitles" : "No voice-over");
  add("brand", "Brand or logo shown", "Merk of logo zichtbaar", clips.some((c) => c.type === "logo"), 10, "");
  const score = Math.round((checks.filter((c) => c.pass).reduce((a, c) => a + c.weight, 0) / checks.reduce((a, c) => a + c.weight, 0)) * 100);
  return { score, checks, analyzedAt: new Date().toISOString() };
}
