// Applies an ad style to an existing project without touching content or timing.
import type { ProjectDoc } from "../../remotion/types";
import { getStyle } from "./styles";

export function restyle(doc: ProjectDoc, styleId: string): ProjectDoc {
  const s = getStyle(styleId);
  const d: ProjectDoc = structuredClone(doc);
  d.style = s.id;
  d.fonts = Array.from(new Set([s.headingFont, s.bodyFont, ...d.fonts]));
  for (const t of d.tracks) {
    for (const c of t.clips) {
      if (c.type === "text") {
        const big = c.props.fontSize >= d.width * 0.055;
        c.props.fontFamily = big ? s.headingFont : s.bodyFont;
        if (big) {
          c.props.fontWeight = s.headingWeight;
          c.props.uppercase = s.uppercase;
          c.props.letterSpacing = s.letterSpacing;
          c.in = { ...c.in, preset: s.textIn, easing: s.textEasing };
        }
      } else if (c.type === "background") {
        c.props.kind = s.bg;
      } else if (c.type === "transition" && s.transition) {
        c.props.kind = s.transition;
      } else if (c.type === "image") {
        c.in = { ...c.in, preset: s.mediaIn };
        c.loop = s.mediaLoop;
      } else if (c.type === "price") {
        c.props.style = s.priceStyle;
      } else if (c.type === "button" || c.type === "logo") {
        c.props.fontFamily = s.headingFont;
      }
    }
  }
  return d;
}
