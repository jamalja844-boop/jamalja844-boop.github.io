// Renders a short sample ad for every style to verify the motion engine end-to-end (no network/API needed).
import path from "node:path";
import fs from "node:fs";
import sharp from "sharp";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition, renderStill } from "@remotion/renderer";
import { buildProject } from "../src/lib/engine/builder";
import { ruleCopy, ruleScript } from "../src/lib/agents/rulebased";
import { AD_STYLES, getStyle } from "../src/lib/engine/styles";
import type { AspectRatio } from "../src/remotion/types";

const outDir = process.argv[2] || "smoke-out";
const only = process.argv[3];
fs.mkdirSync(outDir, { recursive: true });

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#ff7a59"/><stop offset="1" stop-color="#ffb199"/></linearGradient></defs><rect x="250" y="120" width="300" height="560" rx="60" fill="url(#g)"/><rect x="300" y="60" width="200" height="90" rx="20" fill="#333"/><text x="400" y="430" font-size="60" text-anchor="middle" fill="#fff" font-family="sans-serif" font-weight="bold">GLOW</text></svg>`;

const main = async () => {
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const img = `data:image/png;base64,${png.toString("base64")}`;
  const serveUrl = await bundle({ entryPoint: path.join(process.cwd(), "src/remotion/index.ts") });
  const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;
  const product = { name: "Glow Serum", brandName: "Lumen", description: "A lightweight vitamin C serum for radiant skin. Absorbs in seconds. Suitable for all skin types.", price: "29.95", oldPrice: "39.95", currency: "€", images: [img], features: [] as string[], url: "https://example.com/glow" };
  for (const s of AD_STYLES) {
    if (only && s.id !== only) continue;
    const aspect: AspectRatio = s.id === "saas" ? "16:9" : s.id === "minimalist" ? "1:1" : "9:16";
    const copy = ruleCopy({ ...product, language: "nl", variant: 1 });
    const scenes = ruleScript(copy, getStyle(s.id).sceneOrder, { ...product, language: "nl" });
    const doc = buildProject({ product, brand: { primary: "#ff7a59", secondary: "#7c5cff", accent: "#22d3ee", background: "#000000", text: "#ffffff" }, copy, scenes, style: s.id, aspect, seconds: 10, language: "nl", variantLabel: s.id, scriptCaptions: true });
    const inputProps = { project: doc };
    const comp = await selectComposition({ serveUrl, id: "Ad", inputProps, browserExecutable, chromiumOptions: { gl: "swangle" } });
    for (const f of [20, Math.round(doc.durationInFrames * 0.5), doc.durationInFrames - 15]) {
      await renderStill({ composition: comp, serveUrl, inputProps, frame: f, output: `${outDir}/${s.id}-${f}.png`, browserExecutable, scale: 0.35, chromiumOptions: { gl: "swangle" } });
    }
    if (only && s.id === only) {
      await renderMedia({ composition: comp, serveUrl, codec: "h264", outputLocation: `${outDir}/${s.id}.mp4`, inputProps, browserExecutable, scale: 0.5, chromiumOptions: { gl: "swangle" } });
    }
    console.log("ok", s.id);
  }
};
main().catch((e) => { console.error(e); process.exit(1); });
