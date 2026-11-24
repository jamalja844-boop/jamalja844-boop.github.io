"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/context";
import { api, fmtDate } from "@/lib/client";
import { Badge, PageHeader, Progress, statusTone } from "@/components/ui";

interface R { id: string; projectId: string; projectName: string; status: string; progress: number; resolution: string; attempts: number; maxAttempts: number; error?: string; outputAssetId?: string; createdAt: string; log: string[]; doc: { aspect: string; seconds: number } }

export default function Renders() {
  const { t } = useT();
  const [data, setData] = useState<{ mode: string; items: R[] } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try { const d = await api<{ mode: string; items: R[] }>("/api/renders"); if (alive) setData(d); } catch { /* retry */ }
      if (alive) setTimeout(tick, 2000);
    };
    tick();
    return () => { alive = false; };
  }, []);
  const act = (id: string, action: string) => api(`/api/renders/${id}`, { method: "POST", json: { action } });
  const del = (id: string) => api(`/api/renders/${id}`, { method: "DELETE" });
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t.renders.title} subtitle={`${t.renders.mode}: ${data?.mode ?? "…"} · ${t.renders.workerHint}`} />
      {data && !data.items.length && <p className="text-muted">{t.renders.empty}</p>}
      <div className="space-y-2">
        {data?.items.map((r) => (
          <div key={r.id} className="card">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <Link href={`/editor/${r.projectId}`} className="font-medium hover:text-accent2">{r.projectName}</Link>
                <div className="text-xs text-muted">{r.doc.aspect} · {r.doc.seconds}s · {r.resolution} · {fmtDate(r.createdAt)} · {t.renders.attempts} {r.attempts}/{r.maxAttempts}</div>
              </div>
              <Badge tone={statusTone(r.status)}>{r.status}</Badge>
              {r.status === "done" && r.outputAssetId && <a className="btn-primary btn-xs" href={`/api/files/${r.outputAssetId}?download=1`}>⇩ {t.common.download}</a>}
              {["failed", "cancelled"].includes(r.status) && <button className="btn-ghost btn-xs" onClick={() => act(r.id, "retry")}>{t.common.retry}</button>}
              {["queued", "rendering", "encoding"].includes(r.status) && <button className="btn-ghost btn-xs" onClick={() => act(r.id, "cancel")}>{t.renders.cancel}</button>}
              {["done", "failed", "cancelled"].includes(r.status) && <button className="btn-ghost btn-xs" onClick={() => del(r.id)}>🗑</button>}
              <button className="btn-ghost btn-xs" onClick={() => setOpen(open === r.id ? null : r.id)}>log</button>
            </div>
            {["rendering", "encoding", "queued"].includes(r.status) && <div className="mt-2"><Progress value={r.progress} /></div>}
            {r.error && <p className="mt-2 text-xs text-red-300">{r.error.slice(0, 400)}</p>}
            {open === r.id && <pre className="mt-2 max-h-40 overflow-auto rounded bg-black/40 p-2 text-[10px]">{r.log.join("\n")}</pre>}
          </div>
        ))}
      </div>
    </div>
  );
}
