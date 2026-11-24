"use client";

import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  addEdge, Background, Controls, Handle, MiniMap, Position, ReactFlow, useEdgesState, useNodesState,
  type Connection, type Edge, type Node, type NodeProps,
} from "@xyflow/react";
import { Bot, CheckCircle2, CircleCheck, FileOutput, Play, Plus, Save, ShieldCheck, Sparkles, Trash2, Wrench, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Badge, JsonView, StatusBadge } from "@/components/ui/misc";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { ModelSelect, defaultModel, modelValue, parseModelValue } from "@/components/shared/model-select";
import { api, ClientApiError } from "@/lib/client/api";
import type { StudioOptions } from "@/lib/studio-options";
import { cn } from "@/lib/utils";

type NType = "start" | "agent" | "llm" | "tool" | "check" | "approval" | "output";
type NData = Record<string, unknown> & { label?: string; runStatus?: string };

const META: Record<NType, { label: string; icon: React.ElementType; color: string; desc: string }> = {
  start: { label: "Start / trigger", icon: Flag, color: "#6EBEEB", desc: "Invoervelden van de workflow" },
  agent: { label: "AI-agent", icon: Bot, color: "#2DD4BF", desc: "Laat een agent een taak uitvoeren" },
  llm: { label: "LLM-stap", icon: Sparkles, color: "#A78BFA", desc: "Eén modelaanroep met prompt" },
  tool: { label: "Tool", icon: Wrench, color: "#FACC15", desc: "Voer een tool uit" },
  check: { label: "Controle", icon: CircleCheck, color: "#34D399", desc: "AI-kwaliteitscontrole (ja/nee-tak)" },
  approval: { label: "Goedkeuring", icon: ShieldCheck, color: "#FB923C", desc: "Menselijke goedkeuring vereist" },
  output: { label: "Uitvoer", icon: FileOutput, color: "#F472B6", desc: "E-mailconcept, record of rapport" },
};

const RUN_RING: Record<string, string> = {
  running: "ring-2 ring-turq-400 shadow-[0_0_24px_-4px_rgba(45,212,191,0.8)]",
  waiting_approval: "ring-2 ring-warning shadow-[0_0_24px_-4px_rgba(246,192,92,0.7)]",
  succeeded: "ring-2 ring-turq-500/70",
  failed: "ring-2 ring-danger",
  skipped: "opacity-40",
};

function FlowNode({ data, type: rfType, selected }: NodeProps<Node<NData>>) {
  const type = unRF(rfType);
  const meta = META[type];
  const Icon = meta.icon;
  return (
    <div className={cn("min-w-[190px] max-w-[230px] rounded-2xl border border-border bg-card px-3 py-2.5 shadow-lg transition-all", selected && "border-brand-sky", data.runStatus && RUN_RING[data.runStatus])}>
      {type !== "start" && <Handle type="target" position={Position.Left} className="!size-3 !border-2 !border-card !bg-brand-sky" />}
      <div className="flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg text-navy-950" style={{ background: meta.color }}><Icon className="size-4" /></span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold leading-tight">{String(data.label || meta.label)}</p>
          <p className="text-[10.5px] uppercase tracking-wide text-muted-foreground">{meta.label}</p>
        </div>
      </div>
      {data.runStatus && <div className="mt-1.5"><StatusBadge status={data.runStatus} /></div>}
      {type === "check" ? (
        <>
          <Handle id="pass" type="source" position={Position.Right} style={{ top: "35%" }} className="!size-3 !border-2 !border-card !bg-turq-400" />
          <Handle id="fail" type="source" position={Position.Right} style={{ top: "75%" }} className="!size-3 !border-2 !border-card !bg-danger" />
          <span className="absolute -right-8 top-[26%] text-[9px] font-bold text-turq-500">ja</span>
          <span className="absolute -right-9 top-[66%] text-[9px] font-bold text-danger">nee</span>
        </>
      ) : type !== "output" ? (
        <Handle type="source" position={Position.Right} className="!size-3 !border-2 !border-card !bg-turq-400" />
      ) : null}
    </div>
  );
}

// React Flow kent eigen standaardtypes ("output", "input"); daarom intern met prefix.
const RF = (t: string) => `wf_${t}`;
const unRF = (t: string | undefined) => (t ?? "").replace(/^wf_/, "") as NType;
const nodeTypes = Object.fromEntries(Object.keys(META).map((k) => [RF(k), FlowNode]));

interface Props {
  slug: string;
  workflow: { id: string; name: string; description: string; status: string; version: number; graph: { nodes: Node<NData>[]; edges: Edge[] } };
  options: StudioOptions;
  agents: { id: string; name: string }[];
  canManage: boolean;
  canRun: boolean;
  recentRuns: { id: string; status: string; created_at: string }[];
}

export function WorkflowEditor({ slug, workflow, options, agents, canManage, canRun, recentRuns }: Props) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NData>>(workflow.graph.nodes.map((n) => ({ ...n, type: RF(n.type ?? "agent") })));
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(workflow.graph.edges.map((e) => ({ ...e, animated: true })));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [runInput, setRunInput] = useState<Record<string, string>>({});
  const [runId, setRunId] = useState<string | null>(null);
  const [runData, setRunData] = useState<{ run: { status: string; error: string | null }; nodes: { node_id: string; status: string; output: unknown; error: string | null }[] } | null>(null);
  const selected = nodes.find((n) => n.id === selectedId) ?? null;
  const selType = selected ? unRF(selected.type) : null;
  const startNode = nodes.find((n) => unRF(n.type) === "start");
  const fields = String(startNode?.data.fields ?? "").split(",").map((f) => f.trim()).filter(Boolean);

  const onConnect = useCallback((c: Connection) => setEdges((eds) => addEdge({ ...c, id: `e-${c.source}-${c.sourceHandle ?? "out"}-${c.target}`, animated: true }, eds)), [setEdges]);

  // Live uitvoeringsstatus op de nodes tonen.
  useEffect(() => {
    if (!runId) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const d = await api.get<NonNullable<typeof runData>>(`/api/w/${slug}/workflow-runs/${runId}`);
        if (stop) return;
        setRunData(d);
        setNodes((ns) => ns.map((n) => ({ ...n, data: { ...n.data, runStatus: d.nodes.find((r) => r.node_id === n.id)?.status } })));
        if (["running", "queued", "waiting_approval"].includes(d.run.status)) timer = setTimeout(poll, 2000);
      } catch {
        timer = setTimeout(poll, 4000);
      }
    };
    poll();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [runId, slug, setNodes]);

  function addNode(type: NType) {
    const id = `${type}-${Math.random().toString(36).slice(2, 7)}`;
    const base: NData = { label: META[type].label };
    if (type === "llm" || type === "check") Object.assign(base, parseModelValue(defaultModel(options.models)));
    if (type === "output") Object.assign(base, { kind: "email_draft", template: "{{prev}}" });
    setNodes((ns) => [...ns, { id, type: RF(type), position: { x: 120 + ns.length * 40, y: 80 + ns.length * 30 }, data: base }]);
    setSelectedId(id);
  }

  function updateData(patch: Partial<NData>) {
    if (!selected) return;
    setNodes((ns) => ns.map((n) => (n.id === selected.id ? { ...n, data: { ...n.data, ...patch } } : n)));
  }

  const graph = useMemo(() => ({
    nodes: nodes.map((n) => {
      const data = { ...n.data };
      delete data.runStatus;
      return { id: n.id, type: unRF(n.type), position: n.position, data };
    }),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null })),
  }), [nodes, edges]);

  async function save(status?: string) {
    setSaving(true);
    try {
      const r = await api.put<{ warnings: string[] }>(`/api/w/${slug}/workflows/${workflow.id}`, { graph, ...(status ? { status } : {}) });
      if (r.warnings.length) toast.warning(`Opgeslagen met aandachtspunten: ${r.warnings.join("; ")}`);
      else toast.success(status === "active" ? "Opgeslagen en geactiveerd" : "Opgeslagen");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Opslaan mislukt");
    } finally {
      setSaving(false);
    }
  }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    try {
      await save();
      const r = await api.post<{ runId: string }>(`/api/w/${slug}/workflows/${workflow.id}/run`, { input: runInput });
      setRunId(r.runId);
      setRunOpen(false);
      toast.success("Workflow gestart");
    } catch (err) {
      toast.error(err instanceof ClientApiError ? err.message : "Starten mislukt");
    }
  }

  const d = selected?.data as Record<string, string> | undefined;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {canManage && (Object.keys(META) as NType[]).filter((t) => t !== "start").map((t) => {
          const Icon = META[t].icon;
          return <Button key={t} size="sm" variant="secondary" onClick={() => addNode(t)} title={META[t].desc}><Plus className="!size-3" /><Icon /> {META[t].label}</Button>;
        })}
        <div className="ml-auto flex gap-2">
          {canManage && <Button size="sm" variant="outline" onClick={() => save()} loading={saving}><Save /> Opslaan</Button>}
          {canManage && workflow.status !== "active" && <Button size="sm" variant="outline" onClick={() => save("active")}><CheckCircle2 /> Activeren</Button>}
          {canRun && <Button size="sm" variant="accent" onClick={() => setRunOpen(true)}><Play /> Uitvoeren</Button>}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="relative h-[640px] overflow-hidden rounded-2xl border border-border bg-[radial-gradient(circle_at_30%_20%,rgba(110,190,235,0.08),transparent_60%)]" data-testid="workflow-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={canManage ? onNodesChange : undefined}
            onEdgesChange={canManage ? onEdgesChange : undefined}
            onConnect={canManage ? onConnect : undefined}
            onNodeClick={(_, n) => setSelectedId(n.id)}
            onPaneClick={() => setSelectedId(null)}
            fitView
            fitViewOptions={{ padding: 0.12, maxZoom: 1.1 }}
            colorMode={resolvedTheme === "light" ? "light" : "dark"}
            deleteKeyCode={canManage ? ["Backspace", "Delete"] : null}
            defaultEdgeOptions={{ style: { stroke: "#6EBEEB", strokeWidth: 2 } }}
          >
            <Background gap={22} size={1} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable className="hidden md:block" />
          </ReactFlow>
          {!selected && (
            <p className="pointer-events-none absolute left-4 top-3 max-w-md rounded-lg bg-card/80 px-3 py-2 text-xs text-muted-foreground backdrop-blur">
              Klik op een node om die te configureren. Verbind nodes door van een rechter- naar een linkerpunt te slepen. Gebruik {"{{input.veld}}"}, {"{{prev}}"} of {"{{node.<id>}}"}.
            </p>
          )}
          {selected && (
          <div className="absolute inset-y-3 right-3 z-10 w-[min(340px,calc(100%-1.5rem))] overflow-y-auto rounded-2xl border border-border bg-card/95 p-4 shadow-2xl backdrop-blur animate-slide-up">
            {(
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Badge>{META[selType!].label}</Badge>
                  <code className="font-mono text-[11px] text-muted-foreground">{selected.id}</code>
                  <Button size="icon" variant="ghost" className="ml-auto" aria-label="Sluiten" onClick={() => setSelectedId(null)}>×</Button>
                  {canManage && selType !== "start" && (
                    <Button size="icon" variant="ghost" aria-label="Node verwijderen" onClick={() => { setNodes((ns) => ns.filter((n) => n.id !== selected.id)); setEdges((es) => es.filter((e) => e.source !== selected.id && e.target !== selected.id)); setSelectedId(null); }}><Trash2 /></Button>
                  )}
                </div>
                <Field label="Naam"><Input value={d?.label ?? ""} disabled={!canManage} onChange={(e) => updateData({ label: e.target.value })} /></Field>
                {selType === "start" && <Field label="Invoervelden" hint="Komma-gescheiden"><Input value={d?.fields ?? ""} disabled={!canManage} onChange={(e) => updateData({ fields: e.target.value })} /></Field>}
                {selType === "agent" && (
                  <>
                    <Field label="Agent">
                      <Select value={d?.agentId ?? ""} disabled={!canManage} onChange={(e) => updateData({ agentId: e.target.value })}>
                        <option value="">Kies een agent…</option>
                        {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </Select>
                    </Field>
                    <Field label="Instructies"><Textarea rows={6} value={d?.instructions ?? ""} disabled={!canManage} onChange={(e) => updateData({ instructions: e.target.value })} /></Field>
                  </>
                )}
                {(selType === "llm" || selType === "check") && (
                  <Field label="Model"><ModelSelect models={options.models} value={d?.provider ? modelValue(d.provider, d.modelId) : ""} onChange={(v) => updateData(parseModelValue(v))} /></Field>
                )}
                {selType === "llm" && <Field label="Prompt"><Textarea rows={6} value={d?.prompt ?? ""} disabled={!canManage} onChange={(e) => updateData({ prompt: e.target.value })} placeholder="Vat samen: {{prev}}" /></Field>}
                {selType === "check" && <Field label="Criteria"><Textarea rows={5} value={d?.criteria ?? ""} disabled={!canManage} onChange={(e) => updateData({ criteria: e.target.value })} /></Field>}
                {selType === "tool" && (
                  <>
                    <Field label="Tool">
                      <Select value={d?.toolKey ?? ""} disabled={!canManage} onChange={(e) => updateData({ toolKey: e.target.value })}>
                        <option value="">Kies een tool…</option>
                        {options.tools.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
                      </Select>
                    </Field>
                    <Field label="Invoer (JSON-template)"><Textarea rows={5} className="font-mono text-xs" value={d?.input ?? "{}"} disabled={!canManage} onChange={(e) => updateData({ input: e.target.value })} /></Field>
                  </>
                )}
                {selType === "approval" && <Field label="Instructies voor beoordelaar"><Textarea rows={4} value={d?.instructions ?? ""} disabled={!canManage} onChange={(e) => updateData({ instructions: e.target.value })} /></Field>}
                {selType === "output" && (
                  <>
                    <Field label="Soort uitvoer">
                      <Select value={d?.kind ?? "email_draft"} disabled={!canManage} onChange={(e) => updateData({ kind: e.target.value })}>
                        <option value="email_draft">E-mailconcept (niet verzonden)</option>
                        <option value="record">Opslaan als bedrijfsgegeven</option>
                        <option value="report">Rapport (tekst)</option>
                      </Select>
                    </Field>
                    {d?.kind === "email_draft" && <Field label="Aan"><Input value={d?.to ?? ""} disabled={!canManage} onChange={(e) => updateData({ to: e.target.value })} placeholder="{{input.email}}" /></Field>}
                    {d?.kind === "record" && <Field label="Collectie"><Input value={d?.collection ?? ""} disabled={!canManage} onChange={(e) => updateData({ collection: e.target.value })} /></Field>}
                    <Field label="Onderwerp / titel"><Input value={d?.subject ?? ""} disabled={!canManage} onChange={(e) => updateData({ subject: e.target.value })} /></Field>
                    <Field label="Inhoud (template)"><Textarea rows={6} value={d?.template ?? ""} disabled={!canManage} onChange={(e) => updateData({ template: e.target.value })} /></Field>
                  </>
                )}
              </div>
            )}
          </div>
          )}
        </div>

        <div>
          {(runData || recentRuns.length > 0) && (
            <div className="rounded-2xl border border-border bg-card p-4" data-testid="workflow-run-panel">
              <p className="mb-2 text-sm font-semibold">Uitvoering</p>
              {runData ? (
                <div className="flex flex-col gap-2">
                  <StatusBadge status={runData.run.status} />
                  {runData.run.error && <p className="text-xs text-danger">{runData.run.error}</p>}
                  {runData.run.status === "waiting_approval" && <a href={`/w/${slug}/approvals`} className="text-xs font-semibold text-warning underline">Goedkeuring vereist → naar goedkeuringen</a>}
                  {runData.nodes.filter((n) => n.status === "succeeded" && n.output).slice(-1).map((n) => <JsonView key={n.node_id} value={n.output} className="max-h-48" />)}
                </div>
              ) : (
                <ul className="flex flex-col gap-1">
                  {recentRuns.slice(0, 6).map((r) => (
                    <li key={r.id}><button className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-sm hover:bg-muted" onClick={() => setRunId(r.id)}><StatusBadge status={r.status} /><span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("nl-NL")}</span></button></li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      <Dialog open={runOpen} onOpenChange={setRunOpen}>
        <DialogContent title={`${workflow.name} uitvoeren`} description="Vul de invoervelden van de startnode in.">
          <form onSubmit={run} className="flex flex-col gap-3">
            {fields.length === 0 && <p className="text-sm text-muted-foreground">Deze workflow heeft geen invoervelden.</p>}
            {fields.map((f) => (
              <Field key={f} label={f}><Textarea rows={f.includes("omschrijving") ? 3 : 1} value={runInput[f] ?? ""} onChange={(e) => setRunInput({ ...runInput, [f]: e.target.value })} /></Field>
            ))}
            <Button type="submit" variant="accent"><Play /> Starten</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
