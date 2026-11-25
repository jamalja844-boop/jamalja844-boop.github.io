// AI Product Photographer.
//  - studioShot(): local, deterministic image processing (sharp) — trims flat borders,
//    centres the product on a clean gradient canvas with a soft shadow. No AI involved.
//  - aiProductScene(): OpenAI Images "edits" endpoint, re-staging the product photo from a prompt.
import sharp from "sharp";
import { getCredentials } from "../server/secrets";
import { getProvider } from "./registry";
import { ProviderNotConfigured } from "./llm";

export async function studioShot(input: Buffer, opts: { size?: number; bg1?: string; bg2?: string } = {}): Promise<Buffer> {
  const size = opts.size ?? 1400;
  const bg1 = opts.bg1 ?? "#f4f4f6";
  const bg2 = opts.bg2 ?? "#dcdce3";
  const trimmed = await sharp(input).trim({ threshold: 18 }).toBuffer().catch(() => input);
  const product = await sharp(trimmed).resize(Math.round(size * 0.72), Math.round(size * 0.72), { fit: "inside" }).png().toBuffer();
  const meta = await sharp(product).metadata();
  const w = meta.width ?? size;
  const h = meta.height ?? size;
  const bg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><defs><radialGradient id="g" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></radialGradient><radialGradient id="s" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><ellipse cx="${size / 2}" cy="${(size + h) / 2 + size * 0.02}" rx="${w * 0.45}" ry="${size * 0.035}" fill="url(#s)"/></svg>`,
  );
  return sharp(bg).composite([{ input: product, left: Math.round((size - w) / 2), top: Math.round((size - h) / 2) }]).jpeg({ quality: 92 }).toBuffer();
}

export async function aiProductScene(owner: string, input: Buffer, prompt: string): Promise<{ image: Buffer; costUsd: number | null }> {
  const c = await getCredentials(owner, "openai");
  const def = getProvider("openai")!;
  if (!c) throw new ProviderNotConfigured("OpenAI is not configured");
  const settings = { ...Object.fromEntries(def.settings.map((s) => [s.key, s.default ?? ""])), ...c.settings };
  const png = await sharp(input).resize(1024, 1024, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } }).png().toBuffer();
  const form = new FormData();
  form.append("model", settings.imageModel);
  form.append("prompt", prompt);
  form.append("size", "1024x1024");
  form.append("image", new Blob([new Uint8Array(png)], { type: "image/png" }), "product.png");
  const r = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${c.values.apiKey}` }, body: form, signal: AbortSignal.timeout(180000) });
  const text = await r.text();
  if (!r.ok) throw new Error(`OpenAI Images ${r.status}: ${text.slice(0, 300)}`);
  const j = JSON.parse(text);
  const b64 = j.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returned no image");
  const per = parseFloat(settings.costPerImage);
  return { image: Buffer.from(b64, "base64"), costUsd: Number.isFinite(per) ? per : null };
}

/**
 * Local background removal for product photos shot on a plain (usually white) background:
 * flood-fills from the image border over pixels close to the border colour and makes them
 * transparent, with a soft edge. Returns null when the background is not plain enough.
 */
export async function cutout(input: Buffer, tolerance = 38): Promise<Buffer | null> {
  const img = sharp(input).rotate().resize(1400, 1400, { fit: "inside", withoutEnlargement: true }).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const px = (x: number, y: number) => (y * w + x) * 4;
  // border colour = median-ish of border samples; require the border to be uniform
  const samples: number[][] = [];
  for (let x = 0; x < w; x += Math.max(1, Math.floor(w / 40))) samples.push([...data.subarray(px(x, 0), px(x, 0) + 3)], [...data.subarray(px(x, h - 1), px(x, h - 1) + 3)]);
  for (let y = 0; y < h; y += Math.max(1, Math.floor(h / 40))) samples.push([...data.subarray(px(0, y), px(0, y) + 3)], [...data.subarray(px(w - 1, y), px(w - 1, y) + 3)]);
  const bg = [0, 1, 2].map((c) => samples.map((s) => s[c]).sort((a, b) => a - b)[Math.floor(samples.length / 2)]);
  const dist = (i: number) => Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]);
  const uniform = samples.filter((s) => Math.abs(s[0] - bg[0]) + Math.abs(s[1] - bg[1]) + Math.abs(s[2] - bg[2]) < tolerance).length / samples.length;
  if (uniform < 0.9) return null;
  const mask = new Uint8Array(w * h); // 1 = background
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    const k = y * w + x;
    if (!mask[k] && dist(k * 4) < tolerance) { mask[k] = 1; stack.push(k); }
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const k = stack.pop()!;
    const x = k % w, y = (k - x) / w;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  let removed = 0;
  for (let k = 0; k < w * h; k++) if (mask[k]) removed++;
  const share = removed / (w * h);
  if (share < 0.08 || share > 0.97) return null; // nothing to remove, or the product itself got removed
  // soft edge: background pixels next to the product get partial alpha by colour distance
  for (let k = 0; k < w * h; k++) {
    if (!mask[k]) continue;
    const d = dist(k * 4);
    data[k * 4 + 3] = d > tolerance * 0.5 ? Math.round(255 * Math.min(1, (d - tolerance * 0.5) / (tolerance * 0.5)) * 0.6) : 0;
  }
  return sharp(data, { raw: { width: w, height: h, channels: 4 } }).trim({ threshold: 1 }).png().toBuffer().catch(() => sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer());
}
