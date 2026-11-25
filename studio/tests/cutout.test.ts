import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { cutout } from "@/lib/providers/image";

const svg = (bg: string, body: string) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="${bg}"/>${body}</svg>`)).png().toBuffer();

describe("background cut-out", () => {
  it("makes a plain white background transparent and keeps the product", async () => {
    const out = await cutout(await svg("#ffffff", `<rect x="200" y="100" width="200" height="400" rx="40" fill="#0f766e"/>`));
    expect(out).not.toBeNull();
    const { data, info } = await sharp(out!).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const corner = data[3];
    const center = data[(Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 4 + 3];
    expect(info.width).toBeLessThan(260); // trimmed to the product
    expect(center).toBe(255);
    expect(corner).toBeLessThan(255);
  });
  it("leaves busy photos alone", async () => {
    const noisy = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#808080", noise: { type: "gaussian", mean: 128, sigma: 60 } } }).png().toBuffer();
    expect(await cutout(noisy)).toBeNull();
  });
});
