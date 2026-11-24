"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Bot, Building2, ExternalLink, Wrench, X } from "lucide-react";
import { useLive, type LiveData } from "@/components/dashboard/live-panel";
import { Badge, EmptyState, StatusBadge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client/api";
import { formatUsd, timeAgo, truncate } from "@/lib/utils";

const OfficeScene = dynamic(() => import("@/components/office/office-scene"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-navy-200">3D-kantoor laden…</div>,
});

interface Summary {
  agent: { id: string; name: string; role_title: string; department: string; description: string; status: string; status_detail: string | null; provider: string; model_id: string; avatar_color: string; data_scopes: string[]; last_active_at: string | null };
  tools: { key: string; name: string; risk_level: string }[];
  tasks: { id: string; title: string; status: string; result: string | null; error: string | null; updated_at: string; orchestration_id: string | null; run_id: string | null }[];
  steps: { phase: string; title: string; tool_key: string | null; status: string; created_at: string }[];
  stats: { runs: number; cost: number; succeeded: number };
}

function AgentPanel({ slug, agentId, onClose }: { slug: string; agentId: string; onClose: () => void }) {
  const [data, setData] = useState<Summary | null>(null);
  useEffect(() => {
    let stop = false;
    const load = () => api.get<Summary>(`/api/w/${slug}/agents/${agentId}/summary`).then((d) => !stop && setData(d)).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [slug, agentId]);
  if (!data) return <div className="p-5 text-sm text-navy-200">Laden…</div>;
  const a = data.agent;
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-5" data-testid="office-agent-panel">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl text-navy-950" style={{ background: a.avatar_color }}><Bot className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-white">{a.name}</p>
          <p className="text-xs text-navy-200">{a.role_title} · {a.department}</p>
        </div>
        <button onClick={onClose} className="rounded-lg p-1 text-navy-200 hover:bg-white/5" aria-label="Sluiten"><X className="size-4" /></button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={a.status} />
        {a.provider === "demo" && <Badge tone="demo">demo</Badge>}
        <span className="text-xs text-navy-200">{a.model_id}</span>
      </div>
      {a.status_detail && <p className="rounded-lg bg-white/5 p-2 text-sm text-navy-100">{a.status_detail}</p>}
      <div className="grid grid-cols-3 gap-2 text-center">
        {[["Runs", data.stats.runs], ["Geslaagd", data.stats.succeeded], ["Kosten", formatUsd(data.stats.cost, 2)]].map(([l, v]) => (
          <div key={l as string} className="rounded-xl border border-white/10 bg-white/[0.03] p-2"><p className="text-[10px] uppercase tracking-wide text-navy-300">{l}</p><p className="text-sm font-bold text-white">{v}</p></div>
        ))}
      </div>
      <section>
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-navy-300">Taken en resultaten</p>
        {data.tasks.length === 0 ? <p className="text-sm text-navy-300">Nog geen taken.</p> : (
          <ul className="flex flex-col gap-1.5">
            {data.tasks.map((t) => (
              <li key={t.id} className="rounded-xl border border-white/8 bg-white/[0.03] p-2.5">
                <div className="flex items-center gap-2"><StatusBadge status={t.status} /><span className="ml-auto text-[10px] text-navy-300">{timeAgo(t.updated_at)}</span></div>
                <p className="mt-1 text-sm font-medium text-white">{t.title}</p>
                {(t.result || t.error) && <p className="mt-0.5 text-xs text-navy-200">{truncate(t.error ?? t.result ?? "", 180)}</p>}
                {t.orchestration_id && <Link href={`/w/${slug}/orchestrator/${t.orchestration_id}`} className="text-[11px] font-semibold text-turq-300 hover:underline">Opdracht bekijken →</Link>}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-navy-300">Recente activiteit</p>
        <ul className="flex flex-col gap-0.5 text-xs text-navy-200">
          {data.steps.length === 0 && <li>Geen activiteit.</li>}
          {data.steps.map((s, i) => <li key={i} className="flex gap-2"><span className="text-navy-300">{timeAgo(s.created_at)}</span><span className={s.status === "error" ? "text-[#f7b3ad]" : ""}>{s.title}</span></li>)}
        </ul>
      </section>
      <section>
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-navy-300">Tools</p>
        <div className="flex flex-wrap gap-1">{data.tools.map((t) => <span key={t.key} className="inline-flex items-center gap-1 rounded-md border border-white/10 px-1.5 py-0.5 text-[11px] text-navy-100"><Wrench className="size-3" />{t.name}</span>)}</div>
      </section>
      <Button asChild variant="accent" className="mt-auto"><Link href={`/w/${slug}/agents/${a.id}`}><ExternalLink /> Gesprekken, taken en logging</Link></Button>
    </div>
  );
}

export function OfficeClient({ slug, initial }: { slug: string; initial: LiveData }) {
  const live = useLive(slug, initial, 3000);
  const [selected, setSelected] = useState<string | null>(null);
  const agents = (live?.agents ?? []) as (LiveData["agents"][number] & { office_position?: { x?: number; z?: number } })[];
  const counts = {
    working: agents.filter((a) => a.status === "working").length,
    waiting: agents.filter((a) => a.status === "waiting_approval").length,
    error: agents.filter((a) => a.status === "error").length,
  };
  if (!agents.length) {
    return <EmptyState icon={<Building2 />} title="Het kantoor is nog leeg" description="Maak agents aan of installeer het sjabloonpakket in de Agent Builder." action={<Button asChild><Link href={`/w/${slug}/agents`}>Naar Agent Builder</Link></Button>} />;
  }
  return (
    <div className="dark relative h-[calc(100dvh-12rem)] min-h-[520px] overflow-hidden rounded-3xl border border-[#173459] bg-[#061327] text-[#e8f0fa]" data-testid="office">
      <OfficeScene agents={agents} links={live?.links ?? []} selectedId={selected} onSelect={setSelected} />
      <div className="pointer-events-none absolute left-4 top-4 flex flex-wrap gap-2">
        {[["Aan het werk", counts.working, "#2DD4BF"], ["Wacht op goedkeuring", counts.waiting, "#F6C05C"], ["Fout", counts.error, "#F2766D"], ["Totaal", agents.length, "#6EBEEB"]].map(([l, v, c]) => (
          <span key={l as string} className="rounded-xl border border-white/10 bg-[#061327]/80 px-3 py-1.5 text-xs backdrop-blur">
            <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: c as string }} />{l}: <b>{v}</b>
          </span>
        ))}
      </div>
      <p className="pointer-events-none absolute bottom-3 left-4 text-[11px] text-navy-300">Klik op een AI-medewerker · scrollen = zoomen · slepen = verschuiven · statussen live uit het systeem</p>
      {selected && (
        <aside className="absolute inset-y-3 right-3 w-[min(360px,calc(100%-1.5rem))] rounded-2xl border border-white/10 bg-[#061327]/92 shadow-2xl backdrop-blur animate-slide-up">
          <AgentPanel slug={slug} agentId={selected} onClose={() => setSelected(null)} />
        </aside>
      )}
    </div>
  );
}
