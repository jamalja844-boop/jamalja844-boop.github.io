// Multi-agent ad production pipeline. Every agent writes its output into the job log so
// the user can see exactly who did what, with which engine (AI provider / rules / code).
import * as z from "zod/v4";
import { db, type Row } from "../server/db";
import { importRemoteImage, mediaUrl, saveMedia, type MediaData } from "../server/media";
import { readFileBuffer } from "../server/storage";
import { scrapeProduct, type ScrapeResult } from "../server/scrape";
import { generateJson } from "../providers/llm";
import { synthesize } from "../providers/tts";
import { aiProductScene, studioShot } from "../providers/image";
import { buildProject, captionClip, palette } from "../engine/builder";
import type { AdBrief, AdCopy, ProductInfo, ScriptScene } from "../engine/brief";
import { AD_STYLES, getStyle, type AdStyleId, type SceneKind } from "../engine/styles";
import { saturation } from "../engine/color";
import { makeClip, anim } from "../../remotion/defaults";
import type { ProjectDoc } from "../../remotion/types";
import { analyzeProject } from "./analyst";
import { ruleCopy, ruleScript, benefitsFrom } from "./rulebased";
import type { AgentId, AgentStep, BrandKitData, GenerateInput, JobData, ProjectData } from "../models";
import { LANGUAGES } from "../providers/registry";

const AGENTS: AgentId[] = ["brand-designer", "product-photographer", "marketing-specialist", "creative-director", "copywriter", "script-writer", "voiceover-specialist", "motion-designer", "video-editor", "ad-analyst"];

const SCENE_KINDS = ["hook", "problem", "solution", "product", "feature", "benefit", "before", "after", "price", "social", "cta", "logo"] as const;
const STYLE_IDS = AD_STYLES.map((s) => s.id) as [AdStyleId, ...AdStyleId[]];

const MarketingSchema = z.object({
  audience: z.string(),
  painPoints: z.array(z.string()).max(5),
  usps: z.array(z.string()).max(5),
  angles: z.array(z.string()).max(6),
  toneOfVoice: z.string(),
});
const CreativeSchema = z.object({
  concepts: z.array(z.object({ label: z.string(), angle: z.string(), hookIdea: z.string(), style: z.enum(STYLE_IDS) })),
});
const CopySchema = z.object({
  hook: z.string(), headline: z.string(), subheadline: z.string(), benefits: z.array(z.string()).min(1).max(4), cta: z.string(),
  badge: z.string().optional(), problem: z.string().optional(), solution: z.string().optional(),
});
const ScriptSchema = z.object({
  scenes: z.array(z.object({ kind: z.enum(SCENE_KINDS), weight: z.number(), onScreenText: z.string(), subText: z.string().optional(), voiceover: z.string() })),
});

class Job {
  constructor(public row: Row<JobData>) {}
  async save() {
    this.row = await db.update("jobs", this.row, { ...this.row.data, heartbeat: new Date().toISOString() });
  }
  step(a: AgentId) {
    return this.row.data.steps.find((s) => s.agent === a)!;
  }
  async start(a: AgentId, message: string) {
    Object.assign(this.step(a), { status: "running", message, startedAt: new Date().toISOString() } satisfies Partial<AgentStep>);
    await this.save();
  }
  async done(a: AgentId, patch: Partial<AgentStep>) {
    Object.assign(this.step(a), { status: "done", finishedAt: new Date().toISOString(), ...patch });
    await this.save();
  }
  async skip(a: AgentId, message: string) {
    Object.assign(this.step(a), { status: "skipped", message, finishedAt: new Date().toISOString() });
    await this.save();
  }
}

export async function createGenerateJob(owner: string, input: GenerateInput) {
  const row = await db.insert<JobData>("jobs", owner, {
    type: "generate", status: "queued", input, heartbeat: new Date().toISOString(),
    steps: AGENTS.map((agent) => ({ agent, status: "pending" })),
  });
  // Run in the background of this server process; progress is persisted on every step.
  void runPipeline(owner, row).catch(() => {});
  return row;
}

const langName = (code: string) => LANGUAGES.find((l) => l.code === code)?.name ?? code;
const useAi = (input: GenerateInput) => input.llmProvider && input.llmProvider !== "none";

async function runPipeline(owner: string, row: Row<JobData>) {
  const job = new Job(row);
  const input = row.data.input as GenerateInput;
  job.row.data.status = "running";
  await job.save();
  try {
    const kit = input.brandKitId ? await db.getOwned<BrandKitData>("brandkits", input.brandKitId, owner) : null;

    /* ---------------- Brand Designer: source data, colors, fonts ---------------- */
    await job.start("brand-designer", "Reading source and brand kit");
    let scraped: ScrapeResult | null = null;
    const product: ProductInfo = { name: "", brandName: kit?.data.name ?? "", description: "", images: [], imageAssetIds: [], features: [] };
    if (input.source === "url" && input.url) {
      scraped = await scrapeProduct(input.url);
      Object.assign(product, { name: scraped.name, brandName: scraped.brandName || product.brandName, description: scraped.description, url: scraped.url, price: scraped.price, oldPrice: scraped.oldPrice, currency: scraped.currency, features: scraped.features, rating: scraped.rating });
    } else if (input.source === "product" && input.productId && kit) {
      const p = kit.data.products.find((x) => x.id === input.productId);
      if (!p) throw new Error("Product not found in brand kit");
      Object.assign(product, { name: p.name, description: p.description, price: p.price, oldPrice: p.oldPrice, currency: p.currency, url: p.url, features: p.features });
      input.assetIds = [...(input.assetIds ?? []), ...p.imageAssetIds];
    } else if (input.source === "text" || input.source === "image") {
      product.description = input.prompt ?? "";
      product.name = (input.prompt ?? "").split(/[.!?\n]/)[0].slice(0, 50) || "New product";
    }
    if (kit?.data.website && !product.url) product.url = kit.data.website;
    const colors = { ...(kit?.data.colors ?? { primary: "#7c5cff", secondary: "#22d3ee", accent: "#f97316", background: "#0b0d12", text: "#ffffff" }) };
    let colorSource = kit ? "brand kit" : "default palette";
    if (!kit && scraped?.colors.length) {
      colors.primary = scraped.colors[0];
      colors.secondary = scraped.colors[1] ?? colors.secondary;
      colors.accent = scraped.colors[2] ?? colors.accent;
      colorSource = "website CSS / theme-color";
    }
    const fonts = { heading: kit?.data.fonts.heading || scraped?.fonts[0] || "", body: kit?.data.fonts.body || scraped?.fonts[1] || scraped?.fonts[0] || "" };
    await job.done("brand-designer", { engine: "code", message: `Brand colors from ${colorSource}`, output: { colors, fonts, platform: scraped?.platform, sources: scraped?.sources, warnings: scraped?.warnings } });

    /* ---------------- Product Photographer: import & prepare imagery ---------------- */
    await job.start("product-photographer", "Importing product imagery");
    const assets: Row<MediaData>[] = [];
    for (const id of input.assetIds ?? []) {
      const a = await db.getOwned<MediaData>("media", id, owner);
      if (a && a.data.kind === "image") assets.push(a);
    }
    if (scraped?.images.length) {
      if (!input.rightsConfirmed) throw new Error("Please confirm you have the rights to use the images from this website.");
      for (const u of scraped.images.slice(0, 6)) {
        try {
          assets.push(await importRemoteImage(owner, u, { brandKitId: input.brandKitId, rightsNote: `Imported from ${scraped.url}; rights confirmed by user` }));
        } catch {
          /* skip broken image */
        }
      }
    }
    // order by resolution, drop tiny images
    const usable = assets.filter((a) => (a.data.width ?? 0) >= 300 && (a.data.height ?? 0) >= 300).sort((a, b) => (b.data.width ?? 0) * (b.data.height ?? 0) - (a.data.width ?? 0) * (a.data.height ?? 0));
    let finalImages = usable.length ? usable : assets;
    let photoEngine: AgentStep["engine"] = "code";
    let photoMsg = `${finalImages.length} image(s) ready`;
    let photoCost: number | null = null;
    if (finalImages.length && input.productPhoto !== "none") {
      const hero = finalImages[0];
      const buf = await readFileBuffer(hero.data.key);
      if (input.productPhoto === "openai") {
        const r = await aiProductScene(owner, buf, `Professional studio product photograph of the same product, centered, on a clean ${getStyle(input.styles[0]).theme === "dark" ? "dark, moody" : "bright"} seamless background with soft shadow, premium commercial lighting. Keep the product exactly as it is.`);
        const a = await saveMedia(owner, r.image, "image/png", { name: `${product.name} – AI studio`, source: "ai", provider: "openai", rights: { confirmed: true, note: "Generated with OpenAI Images from user-provided product image" }, brandKitId: input.brandKitId });
        finalImages = [a, ...finalImages];
        photoEngine = "ai";
        photoCost = r.costUsd;
        photoMsg = "Generated AI studio shot (OpenAI Images) + originals";
      } else {
        const out = await studioShot(buf);
        const a = await saveMedia(owner, out, "image/jpeg", { name: `${product.name} – studio`, source: "upload", rights: { confirmed: true, note: "Processed from user-provided image" }, brandKitId: input.brandKitId });
        finalImages = [a, ...finalImages];
        photoMsg = "Created clean studio composition (local processing) + originals";
      }
    }
    product.images = finalImages.map((a) => mediaUrl(a.id));
    product.imageAssetIds = finalImages.map((a) => a.id);
    if (kit?.data.logoAssetId) {
      product.logo = mediaUrl(kit.data.logoAssetId);
      product.logoAssetId = kit.data.logoAssetId;
    } else if (scraped?.logo && input.rightsConfirmed) {
      try {
        const l = await importRemoteImage(owner, scraped.logo, { name: "Logo", rightsNote: `Logo from ${scraped.url}` });
        if ((l.data.width ?? 0) >= 64) {
          product.logo = mediaUrl(l.id);
          product.logoAssetId = l.id;
        }
      } catch {
        /* no logo */
      }
    }
    // brand colours from the hero image when the site gave none
    if (!kit && !scraped?.colors.length && finalImages[0]?.data.colors?.length) {
      const c = finalImages[0].data.colors.filter((x) => saturation(x) > 0.2);
      if (c[0]) colors.primary = c[0];
      if (c[1]) colors.secondary = c[1];
      colorSource = "product image";
    }
    await job.done("product-photographer", { engine: photoEngine, provider: photoEngine === "ai" ? "openai" : undefined, costUsd: photoCost, message: photoMsg, output: { assetIds: product.imageAssetIds, logo: product.logoAssetId } });
    if (!product.name) product.name = scraped?.siteName ?? "Product";
    const productContext = JSON.stringify({ name: product.name, brand: product.brandName, description: product.description.slice(0, 1500), price: product.price, oldPrice: product.oldPrice, currency: product.currency, features: product.features, rating: product.rating, url: product.url, toneOfVoice: kit?.data.toneOfVoice });
    const honesty = "Only use facts present in the product data. Never invent prices, discounts, ratings, reviews, testimonials, certifications or statistics. Do not copy existing advertisements or slogans of other brands.";

    /* ---------------- Marketing Specialist ---------------- */
    await job.start("marketing-specialist", "Analysing audience and selling points");
    let marketing: z.infer<typeof MarketingSchema>;
    if (useAi(input)) {
      const r = await generateJson(owner, input.llmProvider, `You are a senior performance-marketing strategist. ${honesty}`, `Analyse this product for a short-form video ad campaign. Write in ${langName(input.language)}.\nPRODUCT: ${productContext}`, MarketingSchema);
      marketing = r.data;
      await job.done("marketing-specialist", { engine: "ai", provider: r.provider, model: r.model, costUsd: r.costUsd, output: marketing, message: marketing.audience });
    } else {
      marketing = { audience: "", painPoints: [], usps: benefitsFrom(product.description, product.features, input.language), angles: [], toneOfVoice: kit?.data.toneOfVoice ?? "" };
      await job.done("marketing-specialist", { engine: "rules", output: marketing, message: "Extracted selling points from product text (no AI provider selected)" });
    }

    /* ---------------- Creative Director ---------------- */
    await job.start("creative-director", "Defining concepts per variant");
    const n = Math.max(1, Math.min(6, input.variants));
    const styleFor = (i: number) => input.styles[i % input.styles.length] ?? "motion";
    let concepts: { label: string; angle: string; hookIdea: string; style: AdStyleId }[];
    if (useAi(input)) {
      const r = await generateJson(owner, input.llmProvider, `You are an award-winning creative director for social video ads. ${honesty}`, `Create ${n} clearly different ad concepts (different opening hooks, angles and presentation). Use these styles in this order: ${Array.from({ length: n }, (_, i) => styleFor(i)).join(", ")}. Write labels and ideas in ${langName(input.language)}.\nMARKETING: ${JSON.stringify(marketing)}\nPRODUCT: ${productContext}`, CreativeSchema);
      concepts = Array.from({ length: n }, (_, i) => ({ ...(r.data.concepts[i] ?? r.data.concepts[0]), style: styleFor(i) }));
      await job.done("creative-director", { engine: "ai", provider: r.provider, model: r.model, costUsd: r.costUsd, output: concepts, message: concepts.map((c) => c.label).join(" · ") });
    } else {
      concepts = Array.from({ length: n }, (_, i) => ({ label: `${getStyle(styleFor(i)).name.en} #${i + 1}`, angle: "", hookIdea: "", style: styleFor(i) }));
      await job.done("creative-director", { engine: "rules", output: concepts, message: `${n} variant(s) with rotating hooks and styles` });
    }

    /* ---------------- Copywriter + Script Writer (per variant, in parallel) ---------------- */
    await job.start("copywriter", "Writing ad copy");
    await job.start("script-writer", "Writing scene scripts");
    const wordBudget = Math.round(input.seconds * 2.3);
    let copyCost = 0, scriptCost = 0;
    let copyMeta: { provider?: string; model?: string } = {};
    const written = await Promise.all(concepts.map(async (concept, i) => {
      const style = getStyle(concept.style);
      if (!useAi(input)) {
        const copy = ruleCopy({ ...product, language: input.language, variant: i });
        return { copy, scenes: ruleScript(copy, style.sceneOrder, { ...product, language: input.language }) };
      }
      const c = await generateJson(owner, input.llmProvider, `You are a direct-response copywriter for short video ads. ${honesty} Mark 1-2 key words in the hook with **double asterisks**. Hook max 7 words, CTA max 3 words, benefits max 6 words each. Only include "badge" if a real discount exists in the data.`, `Write copy in ${langName(input.language)} for concept "${concept.label}" (angle: ${concept.angle}; hook idea: ${concept.hookIdea}; style: ${style.name.en}).\nMARKETING: ${JSON.stringify(marketing)}\nPRODUCT: ${productContext}`, CopySchema);
      const copy = c.data as AdCopy;
      const order = style.sceneOrder.filter((k) => (k === "price" ? !!product.price : true));
      const s = await generateJson(owner, input.llmProvider, `You are a script writer for ${input.seconds}-second video ads. ${honesty} On-screen text max 7 words per scene. Voice-over total max ${wordBudget} words, natural spoken ${langName(input.language)}. "weight" is the relative scene length (0.5–2).`, `Write the scene script using exactly these scene kinds in order: ${order.join(", ")}.\nCOPY: ${JSON.stringify(copy)}\nPRODUCT: ${productContext}`, ScriptSchema);
      copyCost += c.costUsd ?? 0;
      scriptCost += s.costUsd ?? 0;
      copyMeta = { provider: c.provider, model: c.model };
      return { copy, scenes: s.data.scenes as ScriptScene[] };
    }));
    const engine = useAi(input) ? "ai" : "rules";
    await job.done("copywriter", { engine, ...copyMeta, costUsd: useAi(input) ? copyCost : undefined, output: written.map((w) => w.copy), message: written.map((w) => w.copy.hook.replace(/\*\*/g, "")).join(" | ") });
    await job.done("script-writer", { engine, ...copyMeta, costUsd: useAi(input) ? scriptCost : undefined, output: written.map((w) => w.scenes), message: `${written[0].scenes.length} scenes per variant` });

    /* ---------------- Voice-over Specialist ---------------- */
    const voices: ({ assetId: string; duration: number; words: { text: string; start: number; end: number }[]; timing: "exact" | "estimated" } | null)[][] = [];
    if (input.ttsProvider && input.ttsProvider !== "none") {
      await job.start("voiceover-specialist", `Synthesising voice-over (${input.ttsProvider})`);
      let ttsCost = 0;
      for (const w of written) {
        const perScene = [];
        for (const sc of w.scenes) {
          if (!sc.voiceover.trim()) { perScene.push(null); continue; }
          const r = await synthesize(owner, input.ttsProvider, sc.voiceover, input.language, input.voice);
          ttsCost += r.costUsd ?? 0;
          const a = await saveMedia(owner, r.audio, r.mime, { name: `VO: ${sc.voiceover.slice(0, 40)}`, source: "tts", provider: r.provider, rights: { confirmed: true, note: `Generated with ${r.provider}` } });
          perScene.push({ assetId: a.id, duration: r.duration, words: r.words, timing: r.timing });
        }
        voices.push(perScene);
      }
      await job.done("voiceover-specialist", { engine: "ai", provider: input.ttsProvider, costUsd: ttsCost, message: `${voices.flat().filter(Boolean).length} voice clips, subtitles ${voices.flat().find(Boolean)?.timing ?? ""} synced` });
    } else {
      await job.skip("voiceover-specialist", "No TTS provider selected — on-screen subtitles use estimated timing");
    }

    /* ---------------- Motion Designer + Video Editor ---------------- */
    await job.start("motion-designer", "Building animated scenes");
    await job.start("video-editor", "Assembling timeline");
    const groupId = `grp_${Date.now().toString(36)}`;
    const projectIds: string[] = [];
    const editorNotes: string[] = [];
    for (let i = 0; i < written.length; i++) {
      const w = written[i];
      const vo = voices[i];
      // let voice-over length drive scene weights so speech fits its scene
      const scenes = w.scenes.map((s, k) => ({ ...s, weight: vo?.[k] ? vo[k]!.duration + 0.6 : s.weight }));
      const voTotal = vo?.reduce((a, v) => a + (v ? v.duration + 0.6 : 0), 0) ?? 0;
      if (voTotal > input.seconds) editorNotes.push(`Variant ${i + 1}: voice-over (${voTotal.toFixed(1)}s) is longer than ${input.seconds}s — shorten the script or choose a longer duration.`);
      for (const aspect of input.aspects) {
        const brief: AdBrief = {
          product, brand: { ...colors, headingFont: fonts.heading, bodyFont: fonts.body, toneOfVoice: kit?.data.toneOfVoice }, copy: w.copy, scenes,
          style: concepts[i].style, aspect, seconds: input.seconds, language: input.language, variantLabel: concepts[i].label,
          scriptCaptions: input.captions && !vo,
        };
        const doc = buildProject(brief);
        if (input.language === "ar") doc.fonts = Array.from(new Set([...doc.fonts, "Cairo"]));
        if (vo) addVoice(doc, brief, vo, input.captions);
        if (input.musicAssetId) {
          const m = await db.getOwned<MediaData>("media", input.musicAssetId, owner);
          if (m) {
            doc.tracks.find((t) => t.name === "Music")!.clips.push(makeClip("audio", { name: m.data.name, start: 0, duration: doc.durationInFrames, in: anim("none", 0), props: { src: mediaUrl(m.id), assetId: m.id, role: "music", volume: vo ? 0.18 : 0.5, fadeIn: 0.5, fadeOut: 1.2, trimStart: 0 } }));
          }
        }
        doc.meta = { ...doc.meta, analysis: analyzeProject(doc) };
        const p = await db.insert<ProjectData>("projects", owner, { doc, brandKitId: input.brandKitId, groupId });
        projectIds.push(p.id);
      }
    }
    await job.done("motion-designer", { engine: "code", message: `${projectIds.length} animated project(s) across ${input.aspects.join(", ")}` });
    await job.done("video-editor", { engine: "code", message: editorNotes.join(" ") || "Timeline assembled: transitions, captions, audio" + (input.musicAssetId ? ", music ducked under voice" : "") });

    /* ---------------- Ad Analyst ---------------- */
    await job.start("ad-analyst", "Scoring variants");
    const scores = [];
    for (const id of projectIds) {
      const p = await db.get<ProjectData>("projects", id);
      const a = (p?.data.doc.meta?.analysis ?? null) as { score: number } | null;
      scores.push({ projectId: id, name: p?.data.doc.name, aspect: p?.data.doc.aspect, score: a?.score });
    }
    await job.done("ad-analyst", { engine: "rules", output: scores, message: `Scores: ${scores.map((s) => s.score).join(", ")} (rule-based checks on the timeline)` });

    job.row.data.status = "done";
    job.row.data.result = { projectIds, groupId };
    await job.save();
  } catch (e) {
    const running = job.row.data.steps.find((s) => s.status === "running");
    if (running) Object.assign(running, { status: "failed", message: e instanceof Error ? e.message : String(e) });
    job.row.data.status = "failed";
    job.row.data.error = e instanceof Error ? e.message : String(e);
    await job.save();
  }
}

function addVoice(doc: ProjectDoc, brief: AdBrief, vo: ({ assetId: string; duration: number; words: { text: string; start: number; end: number }[]; timing: "exact" | "estimated" } | null)[], captions: boolean) {
  const fps = doc.fps;
  const voiceTrack = doc.tracks.find((t) => t.name === "Voice-over")!;
  const capTrack = doc.tracks.find((t) => t.name === "Subtitles")!;
  const style = getStyle(brief.style);
  const pal = palette(brief, style);
  doc.scenes.forEach((sc, k) => {
    const v = vo[k];
    if (!v) return;
    const start = sc.start + 6;
    const dur = Math.min(Math.ceil(v.duration * fps) + 2, doc.durationInFrames - start);
    if (dur <= 0) return;
    voiceTrack.clips.push(makeClip("audio", { name: `VO ${k + 1}`, start, duration: dur, in: anim("none", 0), props: { src: mediaUrl(v.assetId), assetId: v.assetId, role: "voiceover", volume: 1, fadeIn: 0, fadeOut: 0, trimStart: 0, text: sc.voiceover } }));
    if (captions && style.captionStyle !== "none") {
      const words = v.words.map((w) => ({ text: w.text, start: start + Math.round(w.start * fps), end: start + Math.round(w.end * fps) }));
      capTrack.clips.push(captionClip({ W: doc.width, H: doc.height, portrait: doc.height / doc.width > 1.15, body: doc.fonts[1], style, pal }, words, sc.start, sc.duration, v.timing));
    }
  });
}

export type { SceneKind };
