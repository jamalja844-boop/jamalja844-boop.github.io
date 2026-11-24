"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, Bot } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, StatusBadge } from "@/components/ui/misc";
import { api } from "@/lib/client/api";
import { cn, timeAgo } from "@/lib/utils";

export interface LiveData {
  agents: { id: string; key: string; name: string; role_title: string; department: string; status: string; status_detail: string | null; avatar_color: string; open_tasks: number; last_active_at: string | null }[];
  tasks: { id: string; title: string; status: string; agent_name: string; agent_key: string; orchestration_id: string | null; workflow_run_id: string | null; updated_at: string }[];
  links: { from_key: string; to_key: string; active: boolean }[];
  pendingApprovals: number;
  at: string;
}

export function useLive(slug: string, initial: LiveData | null, intervalMs = 4000) {
  const [data, setData] = useState<LiveData | null>(initial);
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const d = await api.get<LiveData>(`/api/w/${slug}/live`);
        if (!stop) setData(d);
      } catch {
        /* netwerkfout: volgende poging */
      }
    };
    const id = setInterval(tick, intervalMs);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [slug, intervalMs]);
  return data;
}

export function LivePanel({ slug, initial }: { slug: string; initial: LiveData }) {
  const data = useLive(slug, initial);
  const agents = data?.agents ?? [];
  const tasks = data?.tasks ?? [];
  return (
    <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="size-4 text-turq-500" /> Live takenoverzicht
            </CardTitle>
            <CardDescription>Lopende en recent afgeronde agenttaken · ververst elke 4 s</CardDescription>
          </div>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-2 animate-pulse-soft rounded-full bg-turq-400" /> live
          </span>
        </CardHeader>
        <CardContent>
          {tasks.length === 0 ? (
            <EmptyState icon={<Activity />} title="Geen lopende taken" description="Start een opdracht in Multi-Agent of een workflow om hier live voortgang te zien." />
          ) : (
            <ul className="divide-y divide-border">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2.5">
                  <StatusBadge status={t.status} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.agent_name} · {timeAgo(t.updated_at)}
                    </p>
                  </div>
                  {t.orchestration_id && (
                    <Link className="text-xs font-semibold text-brand-sky-strong hover:underline dark:text-brand-sky" href={`/w/${slug}/orchestrator/${t.orchestration_id}`}>
                      Bekijk
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="size-4 text-brand-sky" /> Agentstatussen
          </CardTitle>
          <CardDescription>{agents.length} actieve AI-medewerkers</CardDescription>
        </CardHeader>
        <CardContent>
          {agents.length === 0 ? (
            <EmptyState icon={<Bot />} title="Nog geen agents" action={<Link href={`/w/${slug}/agents`} className="text-sm font-semibold text-brand-sky-strong dark:text-brand-sky">Agent aanmaken →</Link>} />
          ) : (
            <ul className="grid max-h-[380px] gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              {agents.map((a) => (
                <li key={a.id}>
                  <Link href={`/w/${slug}/agents/${a.id}`} className="flex items-center gap-2.5 rounded-xl border border-transparent px-2 py-1.5 hover:border-border hover:bg-muted/50">
                    <span className={cn("relative grid size-8 shrink-0 place-items-center rounded-lg text-xs font-bold text-navy-950")} style={{ background: a.avatar_color }}>
                      {a.name.slice(0, 2)}
                      {a.status === "working" && <span className="absolute -right-0.5 -top-0.5 size-2.5 animate-pulse-soft rounded-full bg-turq-400 ring-2 ring-card" />}
                      {a.status === "waiting_approval" && <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-warning ring-2 ring-card" />}
                      {a.status === "error" && <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-danger ring-2 ring-card" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">{a.name}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{a.status_detail || a.role_title || a.department}</span>
                    </span>
                    {a.open_tasks > 0 && <span className="rounded-full bg-accent px-1.5 text-[10px] font-bold">{a.open_tasks}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
