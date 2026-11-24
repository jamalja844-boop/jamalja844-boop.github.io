"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/context";
import { api, fmtDate } from "@/lib/client";
import { Badge, PageHeader } from "@/components/ui";

interface Proj { id: string; name: string; aspect: string; style: string; seconds: number; updatedAt: string; score?: number; groupId?: string }

export default function Projects() {
  const { t } = useT();
  const router = useRouter();
  const [list, setList] = useState<Proj[] | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const load = () => api<Proj[]>("/api/projects").then(setList);
  useEffect(() => { load(); }, []);
  const create = async (aspect: string) => {
    const r = await api<{ id: string }>("/api/projects", { method: "POST", json: { aspect, seconds: 15, name: "Untitled ad" } });
    router.push(`/editor/${r.id}`);
  };
  const del = async (id: string) => { if (confirm(t.common.confirm)) { await api(`/api/projects/${id}`, { method: "DELETE" }); load(); } };
  const render = async (resolution: string) => { await api("/api/renders", { method: "POST", json: { projectIds: sel, resolution } }); router.push("/renders"); };
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t.projects.title} actions={<>
        {sel.length > 0 && <><button className="btn-ghost" onClick={() => render("1080p")}>⇩ MP4 1080p ({sel.length})</button><button className="btn-ghost" onClick={() => render("4k")}>4K</button></>}
        <select className="input w-auto" value="" onChange={(e) => e.target.value && create(e.target.value)}><option value="">+ {t.projects.new}</option>{["9:16", "16:9", "1:1", "4:5"].map((a) => <option key={a}>{a}</option>)}</select>
        <Link href="/create" className="btn-primary">✦ {t.nav.create}</Link>
      </>} />
      {list && !list.length && <p className="text-muted">{t.projects.empty}</p>}
      <div className="overflow-hidden rounded-xl border border-line">
        <table className="w-full text-sm">
          <tbody>
            {list?.map((p) => (
              <tr key={p.id} className="border-b border-line bg-panel hover:bg-panel2">
                <td className="w-8 px-3"><input type="checkbox" checked={sel.includes(p.id)} onChange={() => setSel((s) => s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s, p.id])} /></td>
                <td className="py-2"><Link className="font-medium hover:text-accent2" href={`/editor/${p.id}`}>{p.name}</Link></td>
                <td><Badge>{p.aspect}</Badge></td>
                <td className="text-muted">{p.style}</td>
                <td className="text-muted">{p.seconds}s</td>
                <td>{p.score !== undefined && <Badge tone={p.score >= 75 ? "ok" : "warn"}>{t.projects.score} {p.score}</Badge>}</td>
                <td className="text-xs text-muted">{fmtDate(p.updatedAt)}</td>
                <td className="pr-3 text-right"><Link className="btn-ghost btn-xs" href={`/editor/${p.id}`}>{t.common.edit}</Link> <button className="btn-ghost btn-xs" onClick={() => del(p.id)}>🗑</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
