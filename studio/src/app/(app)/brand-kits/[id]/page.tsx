"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/context";
import { api } from "@/lib/client";
import { ErrorBox, Field, PageHeader } from "@/components/ui";
import type { BrandKitData, ProductEntry } from "@/lib/models";

export default function KitDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useT();
  const router = useRouter();
  const [kit, setKit] = useState<BrandKitData | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [rights, setRights] = useState(false);
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([]);
  const load = () => api<BrandKitData & { id: string }>(`/api/brandkits/${id}`).then(({ id: _i, ...k }) => setKit(k as BrandKitData));
  useEffect(() => { load(); api<typeof templates>("/api/projects?templates=1").then(setTemplates).catch(() => {}); }, [id]);
  if (!kit) return <p className="text-muted">{t.common.loading}</p>;
  const set = (fn: (k: BrandKitData) => void) => { const n = structuredClone(kit); fn(n); setKit(n); };
  const save = async () => {
    setErr("");
    try { await api(`/api/brandkits/${id}`, { method: "PUT", json: { ...kit, website: kit.website || "" } }); setMsg(t.common.saved); setTimeout(() => setMsg(""), 2000); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  const uploadLogo = async (f: File | undefined) => {
    if (!f) return;
    if (!confirm(t.create.rights)) return;
    const fd = new FormData();
    fd.append("file", f);
    fd.append("rights", "true");
    fd.append("brandKitId", id);
    const m = await api<{ id: string; colors?: string[] }>("/api/media", { method: "POST", body: fd });
    set((k) => { k.logoAssetId = m.id; if (m.colors?.[0]) k.colors.primary = m.colors[0]; if (m.colors?.[1]) k.colors.secondary = m.colors[1]; });
  };
  const importFrom = async (platform: "shopify" | "woocommerce" | "website") => {
    setBusy(true); setErr("");
    try {
      await save();
      const r = await api<{ imported: number }>(`/api/brandkits/${id}/import`, { method: "POST", json: { platform, url: platform === "website" ? url : undefined, rights } });
      setMsg(`✓ ${r.imported}`);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  const del = async () => { if (confirm(t.common.confirm)) { await api(`/api/brandkits/${id}`, { method: "DELETE" }); router.push("/brand-kits"); } };
  const updP = (i: number, fn: (p: ProductEntry) => void) => set((k) => fn(k.products[i]));
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title={kit.name} actions={<><span className="self-center text-sm text-emerald-300">{msg}</span><button className="btn-ghost" onClick={del}>{t.common.delete}</button><button className="btn-primary" onClick={save}>{t.common.save}</button></>} />
      <ErrorBox error={err} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card space-y-3">
          <Field label={t.common.name}><input className="input" value={kit.name} onChange={(e) => set((k) => { k.name = e.target.value; })} /></Field>
          <Field label={t.kits.website}><input className="input" value={kit.website ?? ""} onChange={(e) => set((k) => { k.website = e.target.value; })} placeholder="https://" /></Field>
          <Field label={t.kits.logo}>
            <div className="flex items-center gap-3">{kit.logoAssetId && <img src={`/api/files/${kit.logoAssetId}`} alt="" className="h-14 w-14 rounded bg-white/5 object-contain" />}<input type="file" accept="image/*" className="text-xs" onChange={(e) => uploadLogo(e.target.files?.[0])} /></div>
          </Field>
          <Field label={t.kits.colors}>
            <div className="grid grid-cols-5 gap-2">{(Object.keys(kit.colors) as (keyof BrandKitData["colors"])[]).map((c) => <label key={c} className="text-center text-[10px] text-muted"><input type="color" className="h-10 w-full" value={kit.colors[c]} onChange={(e) => set((k) => { k.colors[c] = e.target.value; })} />{c}</label>)}</div>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={`${t.kits.fonts} (heading)`}><input className="input" value={kit.fonts.heading} onChange={(e) => set((k) => { k.fonts.heading = e.target.value; })} /></Field>
            <Field label={`${t.kits.fonts} (body)`}><input className="input" value={kit.fonts.body} onChange={(e) => set((k) => { k.fonts.body = e.target.value; })} /></Field>
          </div>
          <Field label={t.kits.tone}><textarea className="input h-20" value={kit.toneOfVoice} onChange={(e) => set((k) => { k.toneOfVoice = e.target.value; })} placeholder="e.g. warm, confident, no jargon" /></Field>
          <Field label={t.kits.contact}>
            <div className="grid grid-cols-2 gap-2"><input className="input" placeholder="email" value={kit.contact.email ?? ""} onChange={(e) => set((k) => { k.contact.email = e.target.value; })} /><input className="input" placeholder="phone" value={kit.contact.phone ?? ""} onChange={(e) => set((k) => { k.contact.phone = e.target.value; })} /></div>
            <input className="input mt-2" placeholder="address" value={kit.contact.address ?? ""} onChange={(e) => set((k) => { k.contact.address = e.target.value; })} />
          </Field>
          <Field label={t.kits.templates}>
            <div className="space-y-1">{templates.map((tp) => <label key={tp.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={kit.templateProjectIds.includes(tp.id)} onChange={(e) => set((k) => { k.templateProjectIds = e.target.checked ? [...k.templateProjectIds, tp.id] : k.templateProjectIds.filter((x) => x !== tp.id); })} />{tp.name}</label>)}{!templates.length && <p className="text-xs text-muted">—</p>}</div>
          </Field>
        </div>
        <div className="card space-y-3">
          <h3 className="font-semibold">{t.kits.products}</h3>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost btn-xs" disabled={busy} onClick={() => importFrom("shopify")}>{t.kits.importShopify}</button>
            <button className="btn-ghost btn-xs" disabled={busy} onClick={() => importFrom("woocommerce")}>{t.kits.importWoo}</button>
            <button className="btn-ghost btn-xs" onClick={() => set((k) => { k.products.push({ id: `p_${Date.now().toString(36)}`, name: "New product", description: "", imageAssetIds: [], features: [], source: "manual", currency: "€" }); })}>+ {t.kits.addProduct}</button>
          </div>
          <div className="flex gap-2"><input className="input" placeholder={t.kits.importUrl} value={url} onChange={(e) => setUrl(e.target.value)} /><button className="btn-ghost shrink-0" disabled={!url || busy || !rights} onClick={() => importFrom("website")}>↓</button></div>
          <label className="flex items-start gap-2 text-[11px] text-muted"><input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} />{t.create.rights}</label>
          <p className="text-[11px] text-muted">Shopify / WooCommerce: <Link href="/settings" className="text-accent2">{t.nav.settings} → {t.settings.integrations}</Link></p>
          <div className="max-h-[560px] space-y-2 overflow-y-auto">
            {kit.products.map((p, i) => (
              <details key={p.id} className="rounded border border-line bg-bg p-2 text-sm">
                <summary className="flex cursor-pointer items-center gap-2">{p.imageAssetIds[0] && <img src={`/api/files/${p.imageAssetIds[0]}`} alt="" className="h-8 w-8 rounded object-cover" />}<span className="flex-1 truncate">{p.name}</span><span className="text-xs text-muted">{p.currency}{p.price}</span><Link className="btn-ghost btn-xs" href={`/create?source=product`} onClick={(e) => e.stopPropagation()}>✦</Link></summary>
                <div className="mt-2 space-y-2">
                  <input className="input" value={p.name} onChange={(e) => updP(i, (x) => { x.name = e.target.value; })} />
                  <textarea className="input h-20" value={p.description} onChange={(e) => updP(i, (x) => { x.description = e.target.value; })} />
                  <div className="grid grid-cols-3 gap-2"><input className="input" placeholder="price" value={p.price ?? ""} onChange={(e) => updP(i, (x) => { x.price = e.target.value; })} /><input className="input" placeholder="old price" value={p.oldPrice ?? ""} onChange={(e) => updP(i, (x) => { x.oldPrice = e.target.value; })} /><input className="input" placeholder="€" value={p.currency ?? ""} onChange={(e) => updP(i, (x) => { x.currency = e.target.value; })} /></div>
                  <input className="input" placeholder="features, comma separated" value={p.features.join(", ")} onChange={(e) => updP(i, (x) => { x.features = e.target.value.split(",").map((s) => s.trim()).filter(Boolean); })} />
                  <button className="btn-ghost btn-xs" onClick={() => set((k) => { k.products.splice(i, 1); })}>{t.common.delete}</button>
                </div>
              </details>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
