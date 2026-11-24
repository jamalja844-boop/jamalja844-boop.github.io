"use client";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/context";
import { api, fmtBytes, fmtDate } from "@/lib/client";
import { Badge, PageHeader } from "@/components/ui";

interface M { id: string; url: string; name: string; size: number; width?: number; height?: number; duration?: number; createdAt: string }
const target = (w = 1, h = 1) => { const r = w / h; return r < 0.7 ? "TikTok · Reels · Shorts" : r > 1.5 ? "YouTube" : r > 0.95 ? "Instagram · Facebook" : "Feed ads (4:5)"; };

export default function Exports() {
  const { t } = useT();
  const [list, setList] = useState<M[] | null>(null);
  useEffect(() => { api<M[]>("/api/media?kind=render").then(setList); }, []);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t.exports.title} subtitle={t.exports.subtitle} />
      {list && !list.length && <p className="text-muted">{t.exports.empty}</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list?.map((m) => (
          <div key={m.id} className="card space-y-2">
            <video src={m.url} controls preload="metadata" className="max-h-80 w-full rounded bg-black" />
            <div className="truncate text-sm font-medium">{m.name}</div>
            <div className="flex flex-wrap gap-1 text-xs"><Badge tone="info">{target(m.width, m.height)}</Badge><Badge>{m.width}×{m.height}</Badge><Badge>{m.duration?.toFixed(1)}s</Badge><Badge>{fmtBytes(m.size)}</Badge></div>
            <div className="flex items-center justify-between text-xs text-muted">{fmtDate(m.createdAt)}<a className="btn-primary btn-xs" href={`${m.url}?download=1`}>⇩ {t.common.download}</a></div>
          </div>
        ))}
      </div>
    </div>
  );
}
