"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/context";
import { api } from "@/lib/client";
import { AD_STYLES, getStyle } from "@/lib/engine/styles";
import { buildProject } from "@/lib/engine/builder";
import { ruleCopy, ruleScript } from "@/lib/agents/rulebased";
import { AdPlayer } from "@/components/AdPlayer";
import { PageHeader } from "@/components/ui";
import type { AspectRatio } from "@/remotion/types";

// Neutral sample product drawn in SVG (no third-party assets) used only for previews.
const SAMPLE_IMG = "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#7c5cff"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs><rect x="230" y="140" width="340" height="540" rx="70" fill="url(#g)"/><rect x="300" y="80" width="200" height="90" rx="24" fill="#1f2937"/><circle cx="400" cy="420" r="80" fill="#fff" opacity=".25"/></svg>`);

export default function Templates() {
  const { t, locale } = useT();
  const router = useRouter();
  const [preview, setPreview] = useState("motion");
  const [aspect, setAspect] = useState<AspectRatio>("9:16");
  const [mine, setMine] = useState<{ id: string; name: string; aspect: string }[]>([]);
  useEffect(() => { api<typeof mine>("/api/projects?templates=1").then(setMine).catch(() => {}); }, []);
  const doc = useMemo(() => {
    const product = { name: locale === "nl" ? "Voorbeeldproduct" : "Sample Product", brandName: "Sample", description: locale === "nl" ? "Lichtgewicht en duurzaam. Klaar in seconden. Voor elke dag." : "Lightweight and durable. Ready in seconds. Made for every day.", price: "49", oldPrice: "69", currency: "€", images: [SAMPLE_IMG], features: [] };
    const copy = ruleCopy({ ...product, language: locale, variant: 0 });
    return buildProject({ product, brand: { primary: "#7c5cff", secondary: "#22d3ee", accent: "#f97316", background: "#000", text: "#fff" }, copy, scenes: ruleScript(copy, getStyle(preview).sceneOrder, { ...product, language: locale }), style: preview as never, aspect, seconds: 10, language: locale, variantLabel: "sample", scriptCaptions: true });
  }, [preview, aspect, locale]);
  const useTemplate = async (id: string) => {
    const r = await api<{ id: string }>(`/api/projects/${id}/duplicate`, { method: "POST", json: { asTemplate: false } });
    router.push(`/editor/${r.id}`);
  };
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t.templates.title} subtitle={t.templates.sample} />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="grid gap-2 sm:grid-cols-2 lg:col-span-3">
          {AD_STYLES.map((s) => (
            <div key={s.id} onClick={() => setPreview(s.id)} className={`card cursor-pointer p-3 ${preview === s.id ? "border-accent" : ""}`}>
              <div className="font-semibold">{s.name[locale]}</div>
              <div className="mt-1 text-xs text-muted">{s.description[locale]}</div>
              <div className="mt-2 flex items-center justify-between text-[10px] text-muted"><span>{s.headingFont} · {s.textIn} · {s.transition ?? "cut"}</span><Link onClick={(e) => e.stopPropagation()} className="btn-ghost btn-xs" href={`/create?style=${s.id}`}>{t.templates.use}</Link></div>
            </div>
          ))}
        </div>
        <div className="space-y-3 lg:col-span-2">
          <div className="flex gap-2">{(["9:16", "16:9", "1:1", "4:5"] as AspectRatio[]).map((a) => <button key={a} className={`chip ${aspect === a ? "chip-on" : ""}`} onClick={() => setAspect(a)}>{a}</button>)}</div>
          <div className="sticky top-4 mx-auto" style={{ maxWidth: doc.height > doc.width ? 320 : 560 }}><AdPlayer key={preview + aspect} project={doc} autoPlay /></div>
          <div className="card">
            <h3 className="mb-2 font-semibold">{t.templates.mine}</h3>
            {mine.map((m) => <div key={m.id} className="flex items-center justify-between py-1 text-sm"><span>{m.name} <span className="text-xs text-muted">{m.aspect}</span></span><button className="btn-ghost btn-xs" onClick={() => useTemplate(m.id)}>{t.common.open}</button></div>)}
            {!mine.length && <p className="text-xs text-muted">—</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
