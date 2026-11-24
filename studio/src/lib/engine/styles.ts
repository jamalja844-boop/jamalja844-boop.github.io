import type { AnimPreset, BackgroundProps, EasingName, LoopPreset, ParticlesProps, PriceProps, TransitionProps } from "../../remotion/types";

export type AdStyleId =
  | "luxury" | "cinematic" | "motion" | "ecommerce" | "ugc" | "explainer" | "saas" | "product3d"
  | "minimalist" | "keynote" | "tiktok" | "corporate" | "beforeAfter";

export interface AdStyle {
  id: AdStyleId;
  name: { en: string; nl: string };
  description: { en: string; nl: string };
  theme: "dark" | "light" | "brand";
  headingFont: string;
  bodyFont: string;
  headingWeight: number;
  uppercase: boolean;
  letterSpacing: number;
  bg: BackgroundProps["kind"];
  textIn: AnimPreset;
  textEasing: EasingName;
  mediaIn: AnimPreset;
  mediaLoop: LoopPreset;
  transition: TransitionProps["kind"] | null;
  particles: ParticlesProps["kind"] | null;
  priceStyle: PriceProps["style"];
  productPresentation: "image" | "phone" | "3d";
  pace: number; // >1 = faster cuts
  sceneOrder: SceneKind[];
  captionStyle: "bold" | "subtle" | "none";
  musicMood: string;
}

export type SceneKind = "hook" | "problem" | "solution" | "product" | "feature" | "benefit" | "before" | "after" | "price" | "social" | "cta" | "logo";

const S = (s: AdStyle) => s;

export const AD_STYLES: AdStyle[] = [
  S({ id: "luxury", name: { en: "Luxury Product Ad", nl: "Luxe productadvertentie" }, description: { en: "Slow, elegant serif typography, gold accents, spotlight.", nl: "Rustige, elegante serif-typografie, gouden accenten, spotlight." }, theme: "dark", headingFont: "Playfair Display", bodyFont: "Montserrat", headingWeight: 600, uppercase: false, letterSpacing: 2, bg: "spotlight", textIn: "blur", textEasing: "power2.inOut", mediaIn: "zoomOut", mediaLoop: "kenBurns", transition: "flash", particles: "bokeh", priceStyle: "minimal", productPresentation: "image", pace: 0.8, sceneOrder: ["hook", "product", "benefit", "price", "cta"], captionStyle: "subtle", musicMood: "elegant" }),
  S({ id: "cinematic", name: { en: "Cinematic Ad", nl: "Cinematische advertentie" }, description: { en: "Film-like reveals, letterboxing, dramatic light.", nl: "Filmische onthullingen, letterbox, dramatisch licht." }, theme: "dark", headingFont: "Bebas Neue", bodyFont: "Inter", headingWeight: 400, uppercase: true, letterSpacing: 6, bg: "noise", textIn: "maskReveal", textEasing: "expo.out", mediaIn: "blur", mediaLoop: "kenBurns", transition: "bars", particles: "dots", priceStyle: "minimal", productPresentation: "image", pace: 0.9, sceneOrder: ["hook", "product", "feature", "benefit", "cta"], captionStyle: "subtle", musicMood: "epic" }),
  S({ id: "motion", name: { en: "Motion Graphics Ad", nl: "Motion graphics-advertentie" }, description: { en: "Bold kinetic type, shapes, springs and particles.", nl: "Krachtige kinetische typografie, vormen, springs en deeltjes." }, theme: "brand", headingFont: "Poppins", bodyFont: "Poppins", headingWeight: 800, uppercase: false, letterSpacing: 0, bg: "mesh", textIn: "wordsUp", textEasing: "back.out", mediaIn: "pop", mediaLoop: "float", transition: "circle", particles: "sparkles", priceStyle: "burst", productPresentation: "image", pace: 1.2, sceneOrder: ["hook", "product", "benefit", "price", "cta"], captionStyle: "bold", musicMood: "upbeat" }),
  S({ id: "ecommerce", name: { en: "E-commerce Ad", nl: "E-commerce-advertentie" }, description: { en: "Product first, price and discount up front, strong CTA.", nl: "Product voorop, prijs en korting prominent, sterke CTA." }, theme: "light", headingFont: "Inter", bodyFont: "Inter", headingWeight: 900, uppercase: false, letterSpacing: -1, bg: "radial", textIn: "slideUp", textEasing: "power3.out", mediaIn: "pop", mediaLoop: "float", transition: "wipe", particles: "confetti", priceStyle: "tag", productPresentation: "image", pace: 1.2, sceneOrder: ["hook", "product", "benefit", "price", "cta"], captionStyle: "bold", musicMood: "upbeat" }),
  S({ id: "ugc", name: { en: "UGC-style Ad", nl: "UGC-stijl advertentie" }, description: { en: "Casual, native social look with handheld energy and captions.", nl: "Casual, native social-look met handheld-energie en ondertitels." }, theme: "light", headingFont: "Nunito", bodyFont: "Nunito", headingWeight: 800, uppercase: false, letterSpacing: 0, bg: "solid", textIn: "pop", textEasing: "back.out", mediaIn: "zoomIn", mediaLoop: "shake", transition: null, particles: null, priceStyle: "pill", productPresentation: "image", pace: 1.3, sceneOrder: ["hook", "problem", "solution", "benefit", "cta"], captionStyle: "bold", musicMood: "chill" }),
  S({ id: "explainer", name: { en: "Explainer Video", nl: "Uitlegvideo" }, description: { en: "Step-by-step illustrated explanation with icons.", nl: "Stap-voor-stap uitleg met iconen en illustraties." }, theme: "light", headingFont: "Nunito", bodyFont: "Nunito", headingWeight: 800, uppercase: false, letterSpacing: 0, bg: "grid", textIn: "wordsUp", textEasing: "power3.out", mediaIn: "slideLeft", mediaLoop: "float", transition: "slide", particles: null, priceStyle: "pill", productPresentation: "image", pace: 0.9, sceneOrder: ["hook", "problem", "solution", "feature", "benefit", "cta"], captionStyle: "subtle", musicMood: "friendly" }),
  S({ id: "saas", name: { en: "SaaS Product Ad", nl: "SaaS-productadvertentie" }, description: { en: "Device mockups, UI scroll, feature callouts.", nl: "Device-mockups, scrollende UI, feature-callouts." }, theme: "dark", headingFont: "Inter", bodyFont: "Inter", headingWeight: 800, uppercase: false, letterSpacing: -1, bg: "grid", textIn: "wordsUp", textEasing: "expo.out", mediaIn: "slideUp", mediaLoop: "float", transition: "wipe", particles: "lines", priceStyle: "pill", productPresentation: "phone", pace: 1, sceneOrder: ["hook", "problem", "product", "feature", "benefit", "cta"], captionStyle: "subtle", musicMood: "tech" }),
  S({ id: "product3d", name: { en: "3D Product Ad", nl: "3D-productadvertentie" }, description: { en: "Rotating 3D product presentation with studio light.", nl: "Draaiende 3D-productpresentatie met studiolicht." }, theme: "dark", headingFont: "Space Grotesk", bodyFont: "Inter", headingWeight: 700, uppercase: false, letterSpacing: -1, bg: "spotlight", textIn: "blur", textEasing: "expo.out", mediaIn: "zoomIn", mediaLoop: "none", transition: "zoomBlur", particles: "dots", priceStyle: "minimal", productPresentation: "3d", pace: 0.9, sceneOrder: ["hook", "product", "feature", "price", "cta"], captionStyle: "subtle", musicMood: "tech" }),
  S({ id: "minimalist", name: { en: "Minimalist Commercial", nl: "Minimalistische commercial" }, description: { en: "Lots of whitespace, one idea per frame.", nl: "Veel witruimte, één idee per beeld." }, theme: "light", headingFont: "DM Sans", bodyFont: "DM Sans", headingWeight: 500, uppercase: false, letterSpacing: -1, bg: "solid", textIn: "fade", textEasing: "power2.inOut", mediaIn: "fade", mediaLoop: "kenBurns", transition: null, particles: null, priceStyle: "minimal", productPresentation: "image", pace: 0.8, sceneOrder: ["hook", "product", "benefit", "cta"], captionStyle: "none", musicMood: "calm" }),
  S({ id: "keynote", name: { en: "Keynote-style Product Presentation", nl: "Keynote-stijl productpresentatie" }, description: { en: "Clean premium reveal: black stage, big type, product hero (original design, inspired by tech keynotes).", nl: "Strakke premium onthulling: zwart podium, grote typografie, product als held (origineel ontwerp, geïnspireerd op tech-keynotes)." }, theme: "dark", headingFont: "Inter", bodyFont: "Inter", headingWeight: 700, uppercase: false, letterSpacing: -2, bg: "spotlight", textIn: "blur", textEasing: "power3.inOut", mediaIn: "zoomOut", mediaLoop: "float", transition: null, particles: null, priceStyle: "minimal", productPresentation: "image", pace: 0.8, sceneOrder: ["hook", "product", "feature", "benefit", "cta"], captionStyle: "none", musicMood: "calm" }),
  S({ id: "tiktok", name: { en: "TikTok Product Ad", nl: "TikTok-productadvertentie" }, description: { en: "Fast hook in under 1s, big captions, punchy cuts.", nl: "Snelle hook binnen 1s, grote ondertitels, snelle cuts." }, theme: "brand", headingFont: "Montserrat", bodyFont: "Montserrat", headingWeight: 900, uppercase: true, letterSpacing: 0, bg: "linear", textIn: "charsPop", textEasing: "back.out", mediaIn: "pop", mediaLoop: "wiggle", transition: "flash", particles: "confetti", priceStyle: "burst", productPresentation: "image", pace: 1.5, sceneOrder: ["hook", "product", "benefit", "price", "cta"], captionStyle: "bold", musicMood: "energetic" }),
  S({ id: "corporate", name: { en: "Corporate Service Ad", nl: "Zakelijke dienstadvertentie" }, description: { en: "Trustworthy, structured, calm motion with icons.", nl: "Betrouwbaar, gestructureerd, rustige beweging met iconen." }, theme: "light", headingFont: "Lato", bodyFont: "Lato", headingWeight: 800, uppercase: false, letterSpacing: 0, bg: "linear", textIn: "slideRight", textEasing: "power2.out", mediaIn: "fade", mediaLoop: "kenBurns", transition: "slide", particles: null, priceStyle: "pill", productPresentation: "image", pace: 0.9, sceneOrder: ["hook", "problem", "solution", "benefit", "cta"], captionStyle: "subtle", musicMood: "corporate" }),
  S({ id: "beforeAfter", name: { en: "Before & After Ad", nl: "Voor & na-advertentie" }, description: { en: "Contrast the problem with the result.", nl: "Contrast tussen probleem en resultaat." }, theme: "brand", headingFont: "Poppins", bodyFont: "Poppins", headingWeight: 800, uppercase: true, letterSpacing: 0, bg: "linear", textIn: "slideUp", textEasing: "power3.out", mediaIn: "slideLeft", mediaLoop: "kenBurns", transition: "wipe", particles: "sparkles", priceStyle: "tag", productPresentation: "image", pace: 1.1, sceneOrder: ["hook", "before", "after", "benefit", "cta"], captionStyle: "bold", musicMood: "upbeat" }),
];

export const getStyle = (id: string): AdStyle => AD_STYLES.find((s) => s.id === id) ?? AD_STYLES[2];
