// Dev helper: render frames of a project JSON file (prepared for render) to PNGs.
import path from "node:path";
import fs from "node:fs";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { prepareForRender } from "../src/lib/server/renderPrep";
const [file, outDir, ...frames] = process.argv.slice(2);
const project = prepareForRender(JSON.parse(fs.readFileSync(file, "utf8")));
const serveUrl = await bundle({ entryPoint: path.join(process.cwd(), "src/remotion/index.ts") });
const opts = { browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE || null, chromiumOptions: { gl: (process.env.REMOTION_GL || "swangle") as "swangle" } };
const composition = await selectComposition({ serveUrl, id: "Ad", inputProps: { project }, ...opts });
for (const f of frames) await renderStill({ composition, serveUrl, inputProps: { project }, frame: Number(f), output: `${outDir}/still-${f}.png`, scale: 0.4, ...opts });
console.log("ok");
