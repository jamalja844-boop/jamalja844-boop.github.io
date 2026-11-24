// Rule-based (non-AI) fallbacks for each agent. Used when no LLM provider is configured.
// The UI labels output from these as "template engine", never as AI output.
import type { AdCopy, ScriptScene } from "../engine/brief";
import type { SceneKind } from "../engine/styles";

type L = "nl" | "en" | "ar" | "fr" | "de" | "es";

const T: Record<L, {
  hooks: ((n: string) => string)[];
  cta: string[];
  benefitsFallback: string[];
  priceLine: (p: string) => string;
  offer: string;
  problem: string;
  solution: (n: string) => string;
  features: string;
  ctaLine: string;
  social: (v: number, c: number) => string;
}> = {
  en: {
    hooks: [(n) => `Meet **${n}**`, (n) => `Stop scrolling. You need **${n}**.`, (n) => `This changes everything: **${n}**`, (n) => `Why everyone's talking about **${n}**`, (n) => `Upgrade your day with **${n}**`],
    cta: ["Shop now", "Order today", "Get yours", "Try it now", "Discover more"],
    benefitsFallback: ["Designed for everyday use", "Premium quality", "Fast delivery"],
    priceLine: (p) => `Now only ${p}`, offer: "Limited offer", problem: "Tired of settling for less?", solution: (n) => `${n} makes it easy.`,
    features: "Why you'll love it", ctaLine: "Get yours today", social: (v, c) => `Rated ${v}/5 by ${c} customers`,
  },
  nl: {
    hooks: [(n) => `Maak kennis met **${n}**`, (n) => `Stop met scrollen. Je hebt **${n}** nodig.`, (n) => `Dit verandert alles: **${n}**`, (n) => `Waarom iedereen het over **${n}** heeft`, (n) => `Upgrade je dag met **${n}**`],
    cta: ["Shop nu", "Bestel vandaag", "Haal de jouwe", "Probeer het nu", "Ontdek meer"],
    benefitsFallback: ["Gemaakt voor dagelijks gebruik", "Premium kwaliteit", "Snelle levering"],
    priceLine: (p) => `Nu voor maar ${p}`, offer: "Tijdelijke actie", problem: "Ben je het gedoe zat?", solution: (n) => `${n} maakt het makkelijk.`,
    features: "Waarom je het geweldig vindt", ctaLine: "Bestel de jouwe vandaag", social: (v, c) => `Beoordeeld met ${v}/5 door ${c} klanten`,
  },
  de: {
    hooks: [(n) => `Das ist **${n}**`, (n) => `Hör auf zu scrollen. Du brauchst **${n}**.`, (n) => `Das ändert alles: **${n}**`, (n) => `Warum alle über **${n}** sprechen`, (n) => `Mach deinen Tag besser mit **${n}**`],
    cta: ["Jetzt kaufen", "Heute bestellen", "Jetzt sichern", "Jetzt testen", "Mehr entdecken"],
    benefitsFallback: ["Für den Alltag gemacht", "Premium-Qualität", "Schnelle Lieferung"],
    priceLine: (p) => `Jetzt nur ${p}`, offer: "Begrenztes Angebot", problem: "Genug von Kompromissen?", solution: (n) => `${n} macht es einfach.`,
    features: "Darum wirst du es lieben", ctaLine: "Hol es dir noch heute", social: (v, c) => `Mit ${v}/5 von ${c} Kunden bewertet`,
  },
  fr: {
    hooks: [(n) => `Découvrez **${n}**`, (n) => `Arrêtez de scroller. Il vous faut **${n}**.`, (n) => `Ça change tout : **${n}**`, (n) => `Pourquoi tout le monde parle de **${n}**`, (n) => `Sublimez votre journée avec **${n}**`],
    cta: ["Acheter", "Commander", "Je le veux", "Essayer", "En savoir plus"],
    benefitsFallback: ["Conçu pour le quotidien", "Qualité premium", "Livraison rapide"],
    priceLine: (p) => `Seulement ${p}`, offer: "Offre limitée", problem: "Marre des compromis ?", solution: (n) => `${n} vous simplifie la vie.`,
    features: "Pourquoi vous allez l'adorer", ctaLine: "Commandez dès aujourd'hui", social: (v, c) => `Noté ${v}/5 par ${c} clients`,
  },
  es: {
    hooks: [(n) => `Conoce **${n}**`, (n) => `Deja de hacer scroll. Necesitas **${n}**.`, (n) => `Esto lo cambia todo: **${n}**`, (n) => `Por qué todos hablan de **${n}**`, (n) => `Mejora tu día con **${n}**`],
    cta: ["Comprar ahora", "Pide hoy", "Consigue el tuyo", "Pruébalo", "Descubre más"],
    benefitsFallback: ["Diseñado para el día a día", "Calidad premium", "Envío rápido"],
    priceLine: (p) => `Ahora solo ${p}`, offer: "Oferta limitada", problem: "¿Cansado de conformarte?", solution: (n) => `${n} lo hace fácil.`,
    features: "Por qué te encantará", ctaLine: "Consigue el tuyo hoy", social: (v, c) => `Valorado ${v}/5 por ${c} clientes`,
  },
  ar: {
    hooks: [(n) => `تعرّف على **${n}**`, (n) => `توقف عن التمرير. أنت بحاجة إلى **${n}**`, (n) => `هذا يغيّر كل شيء: **${n}**`, (n) => `لماذا يتحدث الجميع عن **${n}**`, (n) => `اجعل يومك أفضل مع **${n}**`],
    cta: ["تسوّق الآن", "اطلب اليوم", "احصل عليه", "جرّبه الآن", "اكتشف المزيد"],
    benefitsFallback: ["مصمم للاستخدام اليومي", "جودة عالية", "توصيل سريع"],
    priceLine: (p) => `الآن فقط ${p}`, offer: "عرض محدود", problem: "هل سئمت من الحلول الضعيفة؟", solution: (n) => `${n} يجعل الأمر سهلاً.`,
    features: "لماذا ستحبه", ctaLine: "احصل عليه اليوم", social: (v, c) => `تقييم ${v}/5 من ${c} عميل`,
  },
};

const lang = (l: string): L => (["nl", "en", "ar", "fr", "de", "es"].includes(l) ? (l as L) : "en");

/** Splits a long description into short benefit statements. */
export function benefitsFrom(description: string, features: string[], language: string): string[] {
  const out = [...features];
  for (const s of description.split(/(?<=[.!?])\s+|\s+[•·|-]\s+/)) {
    const t = s.trim().replace(/[.!]+$/, "");
    if (t.length > 8 && t.length < 70 && out.length < 3) out.push(t);
  }
  const fb = T[lang(language)].benefitsFallback;
  while (out.length < 3) out.push(fb[out.length]);
  return out.slice(0, 3).map((b) => (b.length > 60 ? b.slice(0, 57) + "…" : b));
}

export function ruleCopy(input: { name: string; description: string; features: string[]; price?: string; oldPrice?: string; currency?: string; language: string; variant: number }): AdCopy {
  const t = T[lang(input.language)];
  const n = input.name.length > 40 ? input.name.slice(0, 40) : input.name;
  const discount = input.price && input.oldPrice ? Math.round((1 - Number(input.price) / Number(input.oldPrice)) * 100) : 0;
  return {
    hook: t.hooks[input.variant % t.hooks.length](n),
    headline: n,
    subheadline: input.description.split(/(?<=[.!?])\s/)[0]?.slice(0, 90) ?? "",
    benefits: benefitsFrom(input.description, input.features, input.language),
    cta: t.cta[input.variant % t.cta.length],
    badge: discount > 0 ? `-${discount}%` : undefined,
    problem: t.problem,
    solution: t.solution(n),
  };
}

export function ruleScript(copy: AdCopy, order: SceneKind[], input: { name: string; price?: string; currency?: string; rating?: { value: number; count: number }; language: string }): ScriptScene[] {
  const t = T[lang(input.language)];
  const plain = (s: string) => s.replace(/\*\*/g, "");
  const scenes: ScriptScene[] = [];
  for (const kind of order) {
    switch (kind) {
      case "hook": scenes.push({ kind, weight: 0.8, onScreenText: copy.hook, voiceover: plain(copy.hook) }); break;
      case "problem": case "before": scenes.push({ kind, weight: 1, onScreenText: copy.problem ?? t.problem, voiceover: copy.problem ?? t.problem }); break;
      case "solution": case "after": scenes.push({ kind, weight: 1, onScreenText: copy.solution ?? t.solution(input.name), voiceover: copy.solution ?? t.solution(input.name) }); break;
      case "product": scenes.push({ kind, weight: 1.1, onScreenText: copy.headline, subText: copy.subheadline, voiceover: `${copy.headline}. ${copy.subheadline}` }); break;
      case "feature": case "benefit": scenes.push({ kind, weight: 1.4, onScreenText: t.features, voiceover: copy.benefits.join(". ") + "." }); break;
      case "price": if (input.price) scenes.push({ kind, weight: 1, onScreenText: t.priceLine(`${input.currency ?? ""}${input.price}`), voiceover: t.priceLine(`${input.price} ${input.currency?.trim() === "€" ? "euro" : input.currency ?? ""}`.trim()) }); break;
      case "social": if (input.rating) scenes.push({ kind, weight: 0.8, onScreenText: t.social(input.rating.value, input.rating.count), voiceover: t.social(input.rating.value, input.rating.count) }); break;
      case "cta": case "logo": scenes.push({ kind, weight: 1, onScreenText: t.ctaLine, voiceover: `${copy.cta}!` }); break;
    }
  }
  return scenes;
}

export const offerLabel = (language: string) => T[lang(language)].offer;
