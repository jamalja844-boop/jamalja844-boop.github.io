"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Switch } from "@/components/ui/overlays";
import { ModelSelect, defaultModel, modelValue, parseModelValue } from "@/components/shared/model-select";
import { api, ClientApiError } from "@/lib/client/api";
import type { StudioOptions } from "@/lib/studio-options";

export interface AgentData {
  id?: string;
  key: string; name: string; description: string; role_title: string; department: string; responsibilities: string; goals: string[];
  provider: string; model_id: string; system_prompt: string; prompt_id: string | null; data_scopes: string[]; share_with: string[];
  clearance: string; max_steps: number; max_duration_s: number; max_cost_usd: string | number; avatar_color: string; is_enabled: boolean;
  tool_keys: string[]; knowledge_base_ids: string[];
}

export const EMPTY_AGENT: AgentData = {
  key: "", name: "", description: "", role_title: "", department: "Algemeen", responsibilities: "", goals: [], provider: "", model_id: "",
  system_prompt: "", prompt_id: null, data_scopes: [], share_with: ["*"], clearance: "member", max_steps: 8, max_duration_s: 180,
  max_cost_usd: 0.5, avatar_color: "#2DD4BF", is_enabled: true, tool_keys: [], knowledge_base_ids: [],
};

export function AgentForm({ slug, agent, options, otherAgents, canManage }: { slug: string; agent: AgentData; options: StudioOptions; otherAgents: { key: string; name: string }[]; canManage: boolean }) {
  const router = useRouter();
  const [a, setA] = useState<AgentData>(agent);
  const [model, setModel] = useState(agent.provider ? modelValue(agent.provider, agent.model_id) : defaultModel(options.models));
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof AgentData>(k: K, v: AgentData[K]) => setA({ ...a, [k]: v });
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!model) return toast.error("Kies een model");
    setSaving(true);
    const { provider, modelId } = parseModelValue(model);
    const body = {
      key: a.key, name: a.name, description: a.description, roleTitle: a.role_title, department: a.department, responsibilities: a.responsibilities,
      goals: a.goals.filter((g) => g.trim()), provider, modelId, systemPrompt: a.system_prompt, promptId: a.prompt_id, dataScopes: a.data_scopes,
      shareWith: a.share_with, clearance: a.clearance, maxSteps: Number(a.max_steps), maxDurationS: Number(a.max_duration_s), maxCostUsd: Number(a.max_cost_usd),
      avatarColor: a.avatar_color, toolKeys: a.tool_keys, knowledgeBaseIds: a.knowledge_base_ids, isEnabled: a.is_enabled,
    };
    try {
      if (a.id) {
        await api.put(`/api/w/${slug}/agents/${a.id}`, body);
        toast.success("Agent opgeslagen");
        router.refresh();
      } else {
        const r = await api.post<{ id: string }>(`/api/w/${slug}/agents`, body);
        toast.success("Agent aangemaakt");
        router.push(`/w/${slug}/agents/${r.id}`);
      }
    } catch (err) {
      toast.error(err instanceof ClientApiError ? err.message : "Opslaan mislukt");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!a.id || !confirm(`Agent ${a.name} verwijderen, inclusief taken en uitvoeringsgeschiedenis?`)) return;
    await api.del(`/api/w/${slug}/agents/${a.id}`);
    router.push(`/w/${slug}/agents`);
  }

  const dis = !canManage;
  return (
    <form onSubmit={save} className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Identiteit en functie</CardTitle><CardDescription>Naam, functie, verantwoordelijkheden en doelstellingen.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Naam" htmlFor="aname"><Input id="aname" required minLength={2} value={a.name} disabled={dis} onChange={(e) => setA({ ...a, name: e.target.value, key: a.id ? a.key : e.target.value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) })} /></Field>
          <Field label="Sleutel" hint="Uniek; gebruikt in workflows en deelregels"><Input required pattern="[a-z][a-z0-9_]{1,40}" value={a.key} disabled={dis} onChange={(e) => set("key", e.target.value)} /></Field>
          <Field label="Functie"><Input value={a.role_title} disabled={dis} onChange={(e) => set("role_title", e.target.value)} placeholder="Bijv. Offertespecialist" /></Field>
          <Field label="Afdeling"><Input value={a.department} disabled={dis} onChange={(e) => set("department", e.target.value)} /></Field>
          <Field label="Beschrijving" className="sm:col-span-2"><Textarea rows={2} value={a.description} disabled={dis} onChange={(e) => set("description", e.target.value)} /></Field>
          <Field label="Verantwoordelijkheden" className="sm:col-span-2"><Textarea rows={3} value={a.responsibilities} disabled={dis} onChange={(e) => set("responsibilities", e.target.value)} /></Field>
          <Field label="Taken en doelstellingen" hint="Eén per regel" className="sm:col-span-2"><Textarea rows={3} value={a.goals.join("\n")} disabled={dis} onChange={(e) => set("goals", e.target.value.split("\n"))} /></Field>
          <div className="flex items-center gap-3">
            <input type="color" value={a.avatar_color} disabled={dis} onChange={(e) => set("avatar_color", e.target.value)} className="size-10 cursor-pointer rounded-lg border border-border bg-transparent" aria-label="Kleur" />
            <span className="text-sm text-muted-foreground">Kleur in het 3D-kantoor</span>
          </div>
          <label className="flex items-center gap-3 text-sm"><Switch checked={a.is_enabled} disabled={dis} onCheckedChange={(v) => set("is_enabled", v)} /> Agent actief</label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Model en instructies</CardTitle><CardDescription>Systeeminstructies en optioneel een gekoppelde prompt uit Prompt Studio.</CardDescription></CardHeader>
        <CardContent className="grid gap-4">
          <Field label="AI-model"><ModelSelect models={options.models} value={model} onChange={setModel} /></Field>
          <Field label="Gekoppelde prompt">
            <Select value={a.prompt_id ?? ""} disabled={dis} onChange={(e) => set("prompt_id", e.target.value || null)}>
              <option value="">Geen</option>
              {options.prompts.map((p) => <option key={p.id} value={p.id}>{p.name} (v{p.version})</option>)}
            </Select>
          </Field>
          <Field label="Systeeminstructies"><Textarea rows={7} value={a.system_prompt} disabled={dis} onChange={(e) => set("system_prompt", e.target.value)} /></Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Tools en kennis</CardTitle><CardDescription>De agent kan uitsluitend deze tools en kennisbanken gebruiken.</CardDescription></CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid max-h-72 gap-1 overflow-y-auto pr-1 sm:grid-cols-2">
            {options.tools.map((t) => (
              <label key={t.key} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
                <input type="checkbox" className="mt-0.5 accent-[#14b8a6]" disabled={dis} checked={a.tool_keys.includes(t.key)} onChange={() => set("tool_keys", toggle(a.tool_keys, t.key))} />
                <span><span className="block font-medium leading-tight">{t.name}</span><span className="font-mono text-[10.5px] text-muted-foreground">{t.key}</span></span>
              </label>
            ))}
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Eigen kennisbank(en)</p>
            {options.knowledgeBases.map((kb) => (
              <label key={kb.id} className="flex items-center gap-2 px-2 py-1 text-sm">
                <input type="checkbox" className="accent-[#14b8a6]" disabled={dis} checked={a.knowledge_base_ids.includes(kb.id)} onChange={() => set("knowledge_base_ids", toggle(a.knowledge_base_ids, kb.id))} />
                {kb.name}
              </label>
            ))}
            <p className="mt-1 text-xs text-muted-foreground">Geen selectie = alle kennisbanken binnen de clearance.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Toegangsrechten en limieten</CardTitle><CardDescription>Afgedwongen op de server, ongeacht wat het model vraagt.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Datacollecties" hint="Komma-gescheiden, bijv. klanten, offertes (* = alles)" className="sm:col-span-2">
            <Input value={a.data_scopes.join(", ")} disabled={dis} onChange={(e) => set("data_scopes", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} />
          </Field>
          <Field label="Documentclearance" hint="Hoogste documentniveau dat de agent mag lezen">
            <Select value={a.clearance} disabled={dis} onChange={(e) => set("clearance", e.target.value)}>
              {["viewer", "member", "developer", "admin", "owner"].map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </Field>
          <Field label="Resultaten delen met">
            <Select value={a.share_with.includes("*") ? "*" : "selectie"} disabled={dis} onChange={(e) => set("share_with", e.target.value === "*" ? ["*"] : [])}>
              <option value="*">Alle agents</option>
              <option value="selectie">Alleen geselecteerde agents</option>
            </Select>
          </Field>
          {!a.share_with.includes("*") && (
            <div className="grid max-h-40 gap-1 overflow-y-auto sm:col-span-2 sm:grid-cols-2">
              {otherAgents.map((o) => (
                <label key={o.key} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="accent-[#14b8a6]" disabled={dis} checked={a.share_with.includes(o.key)} onChange={() => set("share_with", toggle(a.share_with, o.key))} /> {o.name}
                </label>
              ))}
            </div>
          )}
          <Field label="Max. stappen"><Input type="number" min={1} max={50} value={a.max_steps} disabled={dis} onChange={(e) => set("max_steps", Number(e.target.value))} /></Field>
          <Field label="Max. tijd (seconden)"><Input type="number" min={10} max={3600} value={a.max_duration_s} disabled={dis} onChange={(e) => set("max_duration_s", Number(e.target.value))} /></Field>
          <Field label="Max. kosten per run (USD)"><Input inputMode="decimal" value={a.max_cost_usd} disabled={dis} onChange={(e) => set("max_cost_usd", e.target.value)} /></Field>
        </CardContent>
      </Card>

      {canManage && (
        <div className="flex gap-2 xl:col-span-2">
          <Button type="submit" variant="accent" loading={saving}><Save /> {a.id ? "Opslaan" : "Agent aanmaken"}</Button>
          {a.id && <Button type="button" variant="danger" onClick={remove}><Trash2 /> Verwijderen</Button>}
        </div>
      )}
    </form>
  );
}
