import { describe, expect, it } from "vitest";
import { findDuplicateImages, imageDuplicateKey, itemOverridesSchema } from "../../app/lib/import/overrides";

describe("bewerkingen (overrides)", () => {
  it("filtert HTML in de beschrijving en laat lege velden weg", () => {
    const r = itemOverridesSchema.parse({ title: "  ", descriptionHtml: '<p onclick="x">Mooi<script>alert(1)</script></p>', tags: ["Wonen"] });
    expect(r).toEqual({ title: undefined, descriptionHtml: "<p>Mooi</p>", tags: ["Wonen"] });
  });

  it("weigert te lange SEO-teksten, onbekende velden en ongeldige collecties", () => {
    expect(itemOverridesSchema.safeParse({ seoTitle: "x".repeat(71) }).success).toBe(false);
    expect(itemOverridesSchema.safeParse({ prijs: 10 }).success).toBe(false);
    expect(itemOverridesSchema.safeParse({ collections: ["gid://shopify/Product/1"] }).success).toBe(false);
    expect(itemOverridesSchema.safeParse({ collections: ["gid://shopify/Collection/123"] }).success).toBe(true);
  });
});

describe("dubbele afbeeldingen", () => {
  it("herkent dezelfde foto in andere formaten of met querystring", () => {
    expect(imageDuplicateKey("https://CDN.lev.nl/img/lamp_800x800.jpg?v=2")).toBe("cdn.lev.nl/img/lamp.jpg");
    expect(imageDuplicateKey("https://cdn.lev.nl/img/lamp-1200x1200.jpg")).toBe("cdn.lev.nl/img/lamp.jpg");
    expect(imageDuplicateKey("https://cdn.lev.nl/img/lamp@2x.jpg")).toBe("cdn.lev.nl/img/lamp.jpg");
    expect(
      findDuplicateImages([
        "https://cdn.lev.nl/img/lamp_800x800.jpg",
        "https://cdn.lev.nl/img/lamp.jpg?w=1200",
        "https://cdn.lev.nl/img/kap.jpg",
      ]),
    ).toEqual([["https://cdn.lev.nl/img/lamp_800x800.jpg", "https://cdn.lev.nl/img/lamp.jpg?w=1200"]]);
  });
});
