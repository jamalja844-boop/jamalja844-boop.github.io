// Re-lays out a project for another aspect ratio (e.g. 9:16 -> 16:9).
import { ASPECT_SIZES, type AspectRatio, type Clip, type ProjectDoc } from "../../remotion/types";

export function reformat(doc: ProjectDoc, aspect: AspectRatio): ProjectDoc {
  const { width, height } = ASPECT_SIZES[aspect];
  const sx = width / doc.width;
  const sy = height / doc.height;
  const s = Math.min(sx, sy);
  const out: ProjectDoc = structuredClone(doc);
  out.aspect = aspect;
  out.width = width;
  out.height = height;
  for (const t of out.tracks) {
    for (const c of t.clips as Clip[]) {
      if (c.type === "audio" || c.type === "background" || c.type === "transition") continue;
      const full = c.width >= doc.width * 0.98 && c.height >= doc.height * 0.98;
      if (full) {
        c.x = 0; c.y = 0; c.width = width; c.height = height;
        continue;
      }
      const cx = (c.x + c.width / 2) * sx;
      const cy = (c.y + c.height / 2) * sy;
      const k = c.type === "text" || c.type === "caption" ? Math.min(sx, 1) * Math.max(s, 0.7) : s;
      const w = c.type === "text" || c.type === "caption" ? Math.min(width * 0.9, c.width * sx) : c.width * s;
      c.width = w;
      c.height = c.height * (c.type === "text" ? Math.max(s, sy * 0.8) : s);
      c.x = cx - c.width / 2;
      c.y = cy - c.height / 2;
      c.keyframes = c.keyframes.map((kf) => ({ ...kf, value: kf.prop === "x" ? kf.value * sx : kf.prop === "y" ? kf.value * sy : kf.prop === "width" || kf.prop === "height" ? kf.value * s : kf.value }));
      const p = c.props as unknown as Record<string, unknown>;
      if (typeof p.fontSize === "number") p.fontSize = Math.round(p.fontSize * k);
    }
  }
  return out;
}
