"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/context";
import { api, fmtDate } from "@/lib/client";
import { Badge, PageHeader, Progress, statusTone } from "@/components/ui";

interface Proj { id: string; name: string; aspect: string; updatedAt: string; score?: number }
interface Prov { id: string; configured: boolean; enabled: boolean }
interface Rend { id: string; projectName: string; status: string; progress: number }

export default function Dashboard() {
  const { t } = useT();
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [projects, setProjects] = useState<Proj[]>([]);
  const [provs, setProvs] = useState<Prov[]>([]);
  const [renders, setRenders] = useState<Rend[]>([]);
  useEffect(() => {
    api<Proj[]>("/api/projects").then(setProjects).catch(() => {});
    api<Prov[]>("/api/settings/providers").then(setProvs).catch(() => {});
    api<{ items: Rend[] }>("/api/renders").then((r) => setRenders(r.items)).catch(() => {});
  }, []);
  const tiles = [
    { href: "/create?source=url", k: "website" as const, d: "URL → ad" },
    { href: "/create?source=product", k: "product" as const, d: "Brand kit product" },
    { href: "/create?source=image", k: "image" as const, d: "Upload → ad" },
    { href: "/create?source=text", k: "text" as const, d: "Prompt → ad" },
    { href: "/ai-video", k: "aiVideo" as const, d: "Runway · Veo · Kling" },
    { href: "/projects", k: "editor" as const, d: "Timeline editor" },
  ];
  const active = provs.filter((p) => p.configured && p.enabled);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t.dash.welcome} subtitle={t.dash.subtitle} />
      <form className="card mb-6 flex flex-wrap gap-3 bg-gradient-to-r from-accent/20 to-accent2/10" onSubmit={(e) => { e.preventDefault(); router.push(`/shop?url=${encodeURIComponent(url)}`); }}>
        <input className="input min-w-[280px] flex-1 text-base" placeholder={t.shop.subtitle} value={url} onChange={(e) => setUrl(e.target.value)} type="url" required />
        <button className="btn-primary px-6">🛒 {t.shop.scan} →</button>
      </form>
      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {tiles.map((x) => (
          <Link key={x.k} href={x.href} className="card transition hover:border-accent">
            <div className="text-sm font-semibold">{t.nav[x.k]}</div>
            <div className="mt-1 text-xs text-muted">{x.d}</div>
          </Link>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <h2 className="mb-3 font-semibold">{t.dash.recent}</h2>
          {projects.length === 0 && <p className="text-sm text-muted">{t.projects.empty}</p>}
          <div className="divide-y divide-line">
            {projects.slice(0, 8).map((p) => (
              <Link key={p.id} href={`/editor/${p.id}`} className="flex items-center justify-between py-2 text-sm hover:text-white">
                <span className="truncate">{p.name}</span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-muted">{p.score !== undefined && <Badge tone={p.score >= 75 ? "ok" : "warn"}>{p.score}</Badge>}{p.aspect} · {fmtDate(p.updatedAt)}</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="space-y-6">
          <div className="card">
            <h2 className="mb-3 font-semibold">{t.dash.providers}</h2>
            {active.length ? <div className="flex flex-wrap gap-2">{active.map((p) => <Badge key={p.id} tone="ok">{p.id}</Badge>)}</div> : <p className="text-sm text-amber-300">{t.dash.noProviders}</p>}
            <Link href="/settings" className="mt-3 inline-block text-xs text-accent2">{t.nav.settings} →</Link>
          </div>
          <div className="card">
            <h2 className="mb-3 font-semibold">{t.dash.queue}</h2>
            {renders.slice(0, 5).map((r) => (
              <div key={r.id} className="mb-2 text-xs">
                <div className="mb-1 flex justify-between"><span className="truncate">{r.projectName}</span><Badge tone={statusTone(r.status)}>{r.status}</Badge></div>
                <Progress value={r.progress} />
              </div>
            ))}
            {!renders.length && <p className="text-sm text-muted">{t.renders.empty}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
