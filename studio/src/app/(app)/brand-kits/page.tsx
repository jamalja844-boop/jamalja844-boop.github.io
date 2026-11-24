"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/context";
import { api } from "@/lib/client";
import { PageHeader } from "@/components/ui";
import type { BrandKitData } from "@/lib/models";

export default function Kits() {
  const { t } = useT();
  const [list, setList] = useState<(BrandKitData & { id: string })[]>([]);
  const [name, setName] = useState("");
  const load = () => api<typeof list>("/api/brandkits").then(setList);
  useEffect(() => { load(); }, []);
  const create = async () => { if (!name) return; await api("/api/brandkits", { method: "POST", json: { name } }); setName(""); load(); };
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t.kits.title} actions={<><input className="input w-56" placeholder={t.common.name} value={name} onChange={(e) => setName(e.target.value)} /><button className="btn-primary" onClick={create}>+ {t.kits.new}</button></>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((k) => (
          <Link key={k.id} href={`/brand-kits/${k.id}`} className="card hover:border-accent">
            <div className="mb-3 flex items-center gap-3">{k.logoAssetId ? <img src={`/api/files/${k.logoAssetId}`} alt="" className="h-10 w-10 rounded object-contain" /> : <div className="h-10 w-10 rounded" style={{ background: k.colors.primary }} />}<div className="font-semibold">{k.name}</div></div>
            <div className="mb-2 flex gap-1">{Object.values(k.colors).map((c, i) => <span key={i} className="h-6 flex-1 rounded" style={{ background: c }} />)}</div>
            <div className="text-xs text-muted">{k.fonts.heading} / {k.fonts.body} · {k.products.length} products</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
