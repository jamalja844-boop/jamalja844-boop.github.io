import { describe, expect, it } from "vitest";
import { buildProject } from "@/lib/engine/builder";
import { reformat } from "@/lib/engine/reformat";
import { restyle } from "@/lib/engine/restyle";
import { AD_STYLES, getStyle } from "@/lib/engine/styles";
import { ruleCopy, ruleScript } from "@/lib/agents/rulebased";
import { analyzeProject } from "@/lib/agents/analyst";
import { computeTransform, keyframeValue } from "@/remotion/anim";
import { makeClip, anim } from "@/remotion/defaults";
import { DURATIONS, type AspectRatio } from "@/remotion/types";

const product = { name: "Glow Serum", brandName: "Lumen", description: "Vitamin C serum for radiant skin. Absorbs in seconds. For all skin types.", price: "29.95", oldPrice: "39.95", currency: "€", images: ["/api/files/med_a"], imageAssetIds: ["med_a"], features: [], url: "https://lumen.test/glow" };
const brand = { primary: "#ff7a59", secondary: "#7c5cff", accent: "#22d3ee", background: "#000000", text: "#ffffff" };

describe("motion designer", () => {
  for (const s of AD_STYLES) {
    for (const aspect of ["9:16", "16:9", "1:1", "4:5"] as AspectRatio[]) {
      for (const seconds of DURATIONS) {
        it(`${s.id} ${aspect} ${seconds}s builds a valid timeline`, () => {
          const copy = ruleCopy({ ...product, language: "nl", variant: 0 });
          const doc = buildProject({ product, brand, copy, scenes: ruleScript(copy, getStyle(s.id).sceneOrder, { ...product, language: "nl" }), style: s.id, aspect, seconds, language: "nl", variantLabel: "t", scriptCaptions: true });
          expect(doc.durationInFrames).toBe(seconds * 30);
          expect(doc.scenes.reduce((a, x) => a + x.duration, 0)).toBe(doc.durationInFrames);
          for (const t of doc.tracks) for (const c of t.clips) {
            expect(c.start).toBeGreaterThanOrEqual(0);
            expect(c.duration).toBeGreaterThan(0);
            expect(c.start + c.duration).toBeLessThanOrEqual(doc.durationInFrames + 10);
            for (const v of [c.x, c.y, c.width, c.height]) expect(Number.isFinite(v)).toBe(true);
          }
          expect(doc.tracks.flatMap((t) => t.clips).some((c) => c.type === "button")).toBe(true);
          const a = analyzeProject(doc);
          expect(a.score).toBeGreaterThan(50);
        });
      }
    }
  }
  it("never shows ratings that are not in the data", () => {
    const copy = ruleCopy({ ...product, language: "en", variant: 0 });
    const scenes = ruleScript(copy, ["hook", "social", "cta"], { ...product, language: "en" });
    expect(scenes.some((s) => s.kind === "social")).toBe(false);
  });
});

describe("animation math", () => {
  it("interpolates keyframes with easing", () => {
    const c = makeClip("text", { start: 10, duration: 60, x: 0, keyframes: [{ id: "a", frame: 0, prop: "x", value: 0, easing: "linear" }, { id: "b", frame: 20, prop: "x", value: 100, easing: "linear" }] });
    expect(keyframeValue(c, "x", 10, 0)).toBeCloseTo(50);
    expect(keyframeValue(c, "x", 40, 0)).toBe(100);
  });
  it("fade-in starts transparent and ends opaque", () => {
    const c = makeClip("shape", { start: 0, duration: 60, in: anim("fade", 10, "linear") });
    expect(computeTransform(c, 0, 30).opacity).toBeCloseTo(0);
    expect(computeTransform(c, 10, 30).opacity).toBeCloseTo(1);
  });
});

describe("reformat & restyle", () => {
  it("keeps layers inside a new aspect ratio", () => {
    const copy = ruleCopy({ ...product, language: "en", variant: 1 });
    const doc = buildProject({ product, brand, copy, scenes: ruleScript(copy, getStyle("motion").sceneOrder, { ...product, language: "en" }), style: "motion", aspect: "9:16", seconds: 15, language: "en", variantLabel: "t", scriptCaptions: false });
    const wide = reformat(doc, "16:9");
    expect(wide.width).toBe(1920);
    for (const c of wide.tracks.flatMap((t) => t.clips)) if (c.type !== "audio") expect(c.x + c.width / 2).toBeLessThanOrEqual(1920);
    const lux = restyle(doc, "luxury");
    expect(lux.style).toBe("luxury");
    expect(lux.fonts).toContain("Playfair Display");
  });
});
