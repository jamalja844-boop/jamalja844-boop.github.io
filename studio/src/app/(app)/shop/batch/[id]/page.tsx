"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/context";
import { api } from "@/lib/client";
import { Badge, PageHeader, Progress } from "@/components/ui";

interface Item {
  jobId: string;
  status: string;
  error?: string;
  product: { name?: string; image?: string; price?: string; currency?: string; url?: string };
  step: { agent: string; message?: string } | null;
  done: number;
  total: number;
  projects: { id: string; aspect: string; name: string; score?: number }[];
  renders: { id: string; status: string; progress: number; outputAssetId?: string; aspect: string; projectId: string; error?: string }[];
  photoAssetIds: string[];
  musicAssetIds: string[];
  clipAssetId?: string;
}
interface Batch { id: string; status: string; items: Item[] }

export default function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useT();
  const [b, setB] = useState<Batch | null>(null);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const d = await api<Batch>(`/api/shop/batch/${id}`);
        if (!alive) return;
        setB(d);
        const busy = d.status !== "done" || d.items.some((i) => i.renders.some((r) => ["queued", "rendering", "encoding"].includes(r.status)));
        if (!busy) return;
      } catch {
        /* retry */
      }
      if (alive) setTimeout(tick, 2500);
    };
    tick();
    return () => { alive = false; };
  }, [id]);
  if (!b) return <p className="text-muted">{t.common.loading}</p>;
  const ready = b.items.reduce((a, i) => a + i.renders.filter((r) => r.status === "done").length, 0);
  const total = b.items.reduce((a, i) => a + Math.max(i.renders.length, i.projects.length || 1), 0);
  const agentName = (a: string) => (t.agents as Record<string, string>)[a] ?? a;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t.shop.making} subtitle={`${ready} / ${total} MP4 ${t.shop.ready.toLowerCase()}`} actions={<Link href="/shop" className="btn-ghost">{t.shop.newShop}</Link>} />
      <div className="mb-6"><Progress value={(ready / Math.max(1, total)) * 100} /></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {b.items.map((it) => {
          const doneRender = it.renders.find((r) => r.status === "done" && r.outputAssetId);
          return (
            <div key={it.jobId} className="card space-y-3 p-3">
              <div className="flex items-center gap-3">
                {it.product.image && <img src={it.product.image} alt="" referrerPolicy="no-referrer" className="h-12 w-12 rounded bg-white object-contain" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{it.product.name}</div>
                  <div className="text-xs text-muted">{it.product.price ? `${it.product.currency ?? ""}${it.product.price}` : ""}</div>
                </div>
                <Badge tone={it.status === "done" ? "ok" : it.status === "failed" ? "err" : "info"}>{it.status === "queued" ? t.shop.waiting : it.status === "failed" ? t.shop.failed : it.status === "done" ? t.shop.ready : `${it.done}/${it.total}`}</Badge>
              </div>
              {doneRender ? (
                <video src={`/api/files/${doneRender.outputAssetId}`} controls playsInline preload="metadata" className="max-h-96 w-full rounded bg-black" />
              ) : it.status === "running" ? (
                <div className="space-y-1 text-xs"><Progress value={(it.done / Math.max(1, it.total)) * 100} /><div className="text-muted">{it.step ? `${agentName(it.step.agent)} — ${it.step.message ?? ""}` : ""}</div></div>
              ) : null}
              {it.error && <p className="text-xs text-red-300">{it.error}</p>}
              {it.renders.map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-xs">
                  <Badge>{r.aspect}</Badge>
                  {r.status === "done" && r.outputAssetId ? <a className="btn-primary btn-xs" href={`/api/files/${r.outputAssetId}?download=1`}>⇩ {t.shop.downloadVideo}</a>
                    : r.status === "failed" ? <span className="text-red-300">{t.shop.failed}: {r.error?.slice(0, 80)}</span>
                    : <span className="flex flex-1 items-center gap-2 text-muted">{t.shop.rendering} <span className="flex-1"><Progress value={r.progress} /></span></span>}
                  <Link className="btn-ghost btn-xs ml-auto" href={`/editor/${r.projectId}`}>✎ {t.shop.openEditor}</Link>
                </div>
              ))}
              {(it.photoAssetIds.length > 0 || it.musicAssetIds.length > 0 || it.clipAssetId) && (
                <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-2 text-xs">
                  {it.photoAssetIds.slice(0, 4).map((p, i) => <a key={p} href={`/api/files/${p}?download=1`} title={`${t.shop.downloadPhoto} ${i + 1}`}><img src={`/api/files/${p}`} alt="" className="h-10 w-10 rounded bg-white object-cover" /></a>)}
                  {it.clipAssetId && <a className="btn-ghost btn-xs" href={`/api/files/${it.clipAssetId}?download=1`}>🎞 AI clip</a>}
                  {it.musicAssetIds.map((m) => <a key={m} className="btn-ghost btn-xs" href={`/api/files/${m}?download=1`}>🎵 {t.shop.downloadMusic}</a>)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
