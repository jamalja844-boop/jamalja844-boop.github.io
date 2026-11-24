"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { EmptyState, StatusBadge } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { AgentForm, type AgentData } from "@/components/agents/agent-form";
import { RunView } from "@/components/agents/run-view";
import { api, ClientApiError } from "@/lib/client/api";
import type { StudioOptions } from "@/lib/studio-options";
import { cn, formatUsd, timeAgo } from "@/lib/utils";

interface RunRow { id: string; status: string; title: string | null; steps_count: number; cost_usd: string; created_at: string; error: string | null; orchestration_id: string | null }

export function AgentDetail({ slug, agent, options, otherAgents, runs, canManage, canRun }: {
  slug: string; agent: AgentData & { id: string }; options: StudioOptions; otherAgents: { key: string; name: string }[]; runs: RunRow[]; canManage: boolean; canRun: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [starting, setStarting] = useState(false);
  const [selected, setSelected] = useState<string | null>(runs[0]?.id ?? null);
  const [tab, setTab] = useState(runs.length ? "runs" : "config");

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setStarting(true);
    try {
      const r = await api.post<{ runId: string }>(`/api/w/${slug}/agents/${agent.id}/run`, { title, instructions });
      toast.success("Taak gestart");
      setSelected(r.runId);
      setTitle("");
      setInstructions("");
      setTab("runs");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ClientApiError ? err.message : "Starten mislukt");
    } finally {
      setStarting(false);
    }
  }

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="runs">Taken &amp; uitvoeringen</TabsTrigger>
        <TabsTrigger value="config">Configuratie</TabsTrigger>
      </TabsList>
      <TabsContent value="runs" className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <div className="flex flex-col gap-4">
          {canRun && (
            <Card>
              <CardHeader><CardTitle>Nieuwe taak</CardTitle><CardDescription>De agent doorloopt: doel → plan → tool → actie → controle → volgende stap.</CardDescription></CardHeader>
              <CardContent>
                <form onSubmit={start} className="flex flex-col gap-3">
                  <Field label="Titel"><Input required minLength={2} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Bijv. Klacht kantoor Zeist verwerken" /></Field>
                  <Field label="Opdracht"><Textarea required rows={4} value={instructions} onChange={(e) => setInstructions(e.target.value)} /></Field>
                  <Button type="submit" variant="accent" loading={starting} disabled={!agent.is_enabled}><Play /> Taak starten</Button>
                </form>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader><CardTitle>Uitvoeringsgeschiedenis</CardTitle></CardHeader>
            <CardContent>
              {runs.length === 0 ? <p className="text-sm text-muted-foreground">Nog geen uitvoeringen.</p> : (
                <ul className="flex flex-col gap-1">
                  {runs.map((r) => (
                    <li key={r.id}>
                      <button onClick={() => setSelected(r.id)} className={cn("w-full rounded-xl px-3 py-2 text-left hover:bg-muted", selected === r.id && "bg-accent")}>
                        <div className="flex items-center gap-2"><StatusBadge status={r.status} /><span className="ml-auto text-xs text-muted-foreground">{timeAgo(r.created_at)}</span></div>
                        <p className="mt-1 truncate text-sm font-medium">{r.title ?? "Taak"}</p>
                        <p className="text-xs text-muted-foreground">{r.steps_count} stappen · {formatUsd(r.cost_usd)}{r.orchestration_id ? " · multi-agent" : ""}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader><CardTitle>Logging en resultaat</CardTitle><CardDescription>Elke stap van de agentcyclus wordt vastgelegd, inclusief toolinvoer en -uitvoer.</CardDescription></CardHeader>
          <CardContent>{selected ? <RunView key={selected} slug={slug} runId={selected} /> : <EmptyState title="Geen run geselecteerd" />}</CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="config">
        <AgentForm slug={slug} agent={agent} options={options} otherAgents={otherAgents} canManage={canManage} />
      </TabsContent>
    </Tabs>
  );
}
