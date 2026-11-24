"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/context";
import { api } from "@/lib/client";
import { AdPlayer } from "@/components/AdPlayer";
import { Badge, ErrorBox, PageHeader, statusTone } from "@/components/ui";
import type { AgentStep, JobData } from "@/lib/models";
import type { ProjectDoc } from "@/remotion/types";

interface Proj { id: string; doc: ProjectDoc }

export default function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, locale } = useT();
  const [job, setJob] = useState<(JobData & { id: string }) | null>(null);
  const [projects, setProjects] = useState<Proj[]>([]);
  const [sel, setSel] = useState(0);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const j = await api<JobData & { id: string }>(`/api/jobs/${id}`);
        if (!alive) return;
        setJob(j);
        if (j.status === "done" && j.result?.projectIds) {
          setProjects(await Promise.all(j.result.projectIds.map((p) => api<Proj>(`/api/projects/${p}`).then((x) => ({ id: p, doc: x.doc })))));
          return;
        }
        if (j.status !== "failed") setTimeout(tick, 1500);
      } catch {
        if (alive) setTimeout(tick, 3000);
      }
    };
    tick();
    return () => {
      alive = false;
    };
  }, [id]);

  const renderAll = async (res: "1080p" | "4k") => {
    await api("/api/renders", { method: "POST", json: { projectIds: projects.map((p) => p.id), resolution: res } });
    setMsg(`${projects.length} → ${t.nav.renders}`);
  };
  const total = job?.steps.reduce((a, s) => a + (s.costUsd ?? 0), 0) ?? 0;
  const cur = projects[sel];
  const analysis = cur?.doc.meta?.analysis as { score: number; checks: { id: string; pass: boolean; label: { en: string; nl: string }; detail: string }[] } | undefined;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={job?.status === "done" ? t.create.result : t.create.agents} subtitle={total > 0 ? `≈ $${total.toFixed(4)} provider cost (based on your cost settings)` : undefined} />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="card space-y-2 lg:col-span-2">
          {job?.steps.map((s: AgentStep) => (
            <div key={s.agent} className="rounded-lg border border-line bg-bg p-2">
              <button className="flex w-full items-center justify-between text-left text-sm" onClick={() => setOpen(open === s.agent ? null : s.agent)}>
                <span className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${s.status === "running" ? "animate-pulse bg-accent2" : s.status === "done" ? "bg-emerald-400" : s.status === "failed" ? "bg-red-500" : "bg-line"}`} />
                  {t.agents[s.agent]}
                </span>
                <span className="flex gap-1">
                  {s.engine && <Badge tone={s.engine === "ai" ? "info" : "muted"}>{t.engine[s.engine]}{s.provider ? ` · ${s.provider}` : ""}</Badge>}
                  <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                </span>
              </button>
              {s.message && <p className="mt-1 text-xs text-muted">{s.message}</p>}
              {open === s.agent && s.output !== undefined && <pre className="mt-2 max-h-60 overflow-auto rounded bg-black/40 p-2 text-[10px]">{JSON.stringify(s.output, null, 2)}</pre>}
            </div>
          ))}
          <ErrorBox error={job?.error} />
          {job?.status === "failed" && <Link href="/create" className="btn-ghost">{t.common.back}</Link>}
        </div>
        <div className="lg:col-span-3">
          {projects.length > 0 && cur && (
            <div className="card space-y-4">
              <div className="flex flex-wrap gap-2">
                {projects.map((p, i) => (
                  <button key={p.id} onClick={() => setSel(i)} className={`chip ${i === sel ? "chip-on" : ""}`}>{p.doc.meta?.variantLabel ?? i + 1} · {p.doc.aspect}</button>
                ))}
              </div>
              <div className="mx-auto" style={{ maxWidth: cur.doc.height > cur.doc.width ? 340 : 640 }}>
                <AdPlayer key={cur.id} project={cur.doc} autoPlay />
              </div>
              {analysis && (
                <div className="rounded-lg border border-line p-3 text-xs">
                  <div className="mb-2 font-semibold">{t.editor.analysis}: <span className={analysis.score >= 75 ? "text-emerald-300" : "text-amber-300"}>{analysis.score}/100</span></div>
                  <ul className="grid gap-1 md:grid-cols-2">
                    {analysis.checks.map((c) => <li key={c.id}>{c.pass ? "✅" : "⚠️"} {c.label[locale]} <span className="text-muted">{c.detail}</span></li>)}
                  </ul>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Link href={`/editor/${cur.id}`} className="btn-primary">{t.create.openEditor}</Link>
                <button className="btn-ghost" onClick={() => renderAll("1080p")}>{t.create.renderAll} (1080p)</button>
                <button className="btn-ghost" onClick={() => renderAll("4k")}>4K</button>
              </div>
              {msg && <p className="text-sm text-emerald-300">✓ {msg} — <Link className="underline" href="/renders">{t.nav.renders}</Link></p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
