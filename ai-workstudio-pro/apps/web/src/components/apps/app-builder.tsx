"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Blocks, Plus, Rocket, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Badge, EmptyState, StatusBadge } from "@/components/ui/misc";
import { Dialog, DialogContent, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { ModelSelect, defaultModel, modelValue, parseModelValue } from "@/components/shared/model-select";
import { AppRunner } from "@/components/apps/app-runner";
import { api, ClientApiError } from "@/lib/client/api";
import type { AppConfig, InputField } from "@/lib/apps/presets";
import type { StudioOptions } from "@/lib/studio-options";
import { timeAgo } from "@/lib/utils";

const err = (e: unknown) => (e instanceof ClientApiError ? e.message : "Er ging iets mis");

export function AppGallery({ slug, apps, types, options, canManage }: {
  slug: string;
  apps: { id: string; name: string; app_type: string; description: string; status: string; runs: number; updated_at: string; min_role: string }[];
  types: { id: string; label: string; description: string }[];
  options: StudioOptions;
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("customer_service");
  const [name, setName] = useState("");
  const [model, setModel] = useState(defaultModel(options.models));
  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await api.post<{ id: string }>(`/api/w/${slug}/apps`, { name, appType: type, ...parseModelValue(model) });
      router.push(`/w/${slug}/apps/${r.id}`);
    } catch (e2) {
      toast.error(err(e2));
    }
  }
  return (
    <div className="flex flex-col gap-4">
      {canManage && <div><Button variant="accent" onClick={() => setOpen(true)}><Plus /> Nieuwe AI-app</Button></div>}
      {apps.length === 0 ? <EmptyState icon={<Blocks />} title="Nog geen AI-apps" description="Bouw zonder programmeren een chatbot, klantenservice, e-mailassistent, documentanalyse, offertegenerator of data-assistent." /> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {apps.map((a) => (
            <Link key={a.id} href={`/w/${slug}/apps/${a.id}`}>
              <Card className="h-full p-5 transition hover:-translate-y-0.5 hover:border-brand-sky/50">
                <div className="flex items-start justify-between gap-2"><p className="font-semibold">{a.name}</p><StatusBadge status={a.status} /></div>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-turq-600 dark:text-turq-400">{types.find((t) => t.id === a.app_type)?.label}</p>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{a.description}</p>
                <p className="mt-3 text-xs text-muted-foreground">{a.runs} keer gebruikt · voor {a.min_role}+ · {timeAgo(a.updated_at)}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Nieuwe AI-app" description="Kies een type; je krijgt een complete voorinstelling die je daarna visueel aanpast." wide>
          <form onSubmit={create} className="flex flex-col gap-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {types.map((t) => (
                <button type="button" key={t.id} onClick={() => setType(t.id)} className={`rounded-xl border p-3 text-left transition ${type === t.id ? "border-turq-400 bg-turq-400/8" : "border-border hover:bg-muted"}`}>
                  <p className="text-sm font-semibold">{t.label}</p>
                  <p className="text-xs text-muted-foreground">{t.description}</p>
                </button>
              ))}
            </div>
            <Field label="Naam"><Input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="Bijv. Klantenservice website" /></Field>
            <Field label="Model"><ModelSelect models={options.models} value={model} onChange={setModel} /></Field>
            <Button type="submit" disabled={!model}>Aanmaken</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AppBuilder({ slug, app, options, canManage }: {
  slug: string;
  app: { id: string; name: string; description: string; status: string; min_role: string; config: AppConfig };
  options: StudioOptions;
  canManage: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(app.name);
  const [description, setDescription] = useState(app.description);
  const [minRole, setMinRole] = useState(app.min_role);
  const [cfg, setCfg] = useState<AppConfig>(app.config);
  const [schemaText, setSchemaText] = useState(JSON.stringify(app.config.output.schema ?? { type: "object", properties: {}, required: [] }, null, 2));
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof AppConfig>(k: K, v: AppConfig[K]) => setCfg({ ...cfg, [k]: v });
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const setField = (i: number, patch: Partial<InputField>) => set("inputFields", cfg.inputFields.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  async function save(status?: string) {
    let schema: Record<string, unknown> | null = null;
    if (cfg.output.format === "json_schema") {
      try {
        schema = JSON.parse(schemaText);
      } catch {
        return toast.error("JSON-schema is geen geldige JSON");
      }
    }
    setSaving(true);
    try {
      await api.put(`/api/w/${slug}/apps/${app.id}`, { name, description, minRole, status, config: { ...cfg, output: { format: cfg.output.format, schema } } });
      toast.success(status === "published" ? "Gepubliceerd voor bevoegde gebruikers" : status === "draft" ? "Teruggezet naar concept" : "Opgeslagen");
      router.refresh();
    } catch (e) {
      toast.error(err(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm("App verwijderen?")) return;
    await api.del(`/api/w/${slug}/apps/${app.id}`);
    router.push(`/w/${slug}/apps`);
  }

  if (!canManage) {
    return <Card><CardContent className="p-5"><AppRunner slug={slug} appId={app.id} fields={app.config.inputFields} /></CardContent></Card>;
  }

  return (
    <Tabs defaultValue="config">
      <div className="flex flex-wrap items-center gap-2">
        <TabsList>
          <TabsTrigger value="config">Configuratie</TabsTrigger>
          <TabsTrigger value="test">Testen</TabsTrigger>
        </TabsList>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => save()} loading={saving}><Save /> Opslaan</Button>
          {app.status === "published" ? (
            <Button variant="secondary" onClick={() => save("draft")}>Publicatie intrekken</Button>
          ) : (
            <Button variant="accent" onClick={() => save("published")}><Rocket /> Publiceren</Button>
          )}
          <Button variant="ghost" size="icon" onClick={remove} aria-label="Verwijderen"><Trash2 /></Button>
        </div>
      </div>
      <TabsContent value="config" className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Algemeen en toegang</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Naam"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Omschrijving"><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
            <Field label="Beschikbaar voor" hint="Alleen gepubliceerde apps zijn bruikbaar voor gebruikers.">
              <Select value={minRole} onChange={(e) => setMinRole(e.target.value)}>
                {[["viewer", "Iedereen"], ["member", "Medewerkers en hoger"], ["developer", "Ontwikkelaars en hoger"], ["admin", "Beheerders"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Model"><ModelSelect models={options.models} value={modelValue(cfg.provider, cfg.modelId)} onChange={(v) => setCfg({ ...cfg, ...parseModelValue(v) })} /></Field>
            <Field label="Gekoppelde prompt (optioneel)">
              <Select value={cfg.promptId ?? ""} onChange={(e) => set("promptId", e.target.value || null)}>
                <option value="">Geen</option>
                {options.prompts.map((p) => <option key={p.id} value={p.id}>{p.name} (v{p.version})</option>)}
              </Select>
            </Field>
            <Field label="Systeeminstructies"><Textarea rows={5} value={cfg.systemPrompt} onChange={(e) => set("systemPrompt", e.target.value)} /></Field>
            <Field label="Gebruikersbericht (template)" hint="Gebruik {{veldnaam}} voor invoervelden"><Textarea rows={4} className="font-mono text-[13px]" value={cfg.userTemplate} onChange={(e) => set("userTemplate", e.target.value)} /></Field>
          </CardContent>
        </Card>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between"><div><CardTitle>Invoervelden</CardTitle><CardDescription>Het formulier dat gebruikers invullen.</CardDescription></div>
              <Button size="sm" variant="secondary" onClick={() => set("inputFields", [...cfg.inputFields, { name: `veld${cfg.inputFields.length + 1}`, label: "Nieuw veld", type: "text" }])}><Plus /> Veld</Button>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {cfg.inputFields.map((f, i) => (
                <div key={i} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1fr_1fr_120px_auto]">
                  <Input value={f.name} onChange={(e) => setField(i, { name: e.target.value })} aria-label="Veldnaam" className="font-mono text-xs" />
                  <Input value={f.label} onChange={(e) => setField(i, { label: e.target.value })} aria-label="Label" />
                  <Select value={f.type} onChange={(e) => setField(i, { type: e.target.value as InputField["type"] })} aria-label="Type">
                    {["text", "textarea", "number", "email", "select"].map((t) => <option key={t}>{t}</option>)}
                  </Select>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-xs"><input type="checkbox" className="accent-[#14b8a6]" checked={Boolean(f.required)} onChange={(e) => setField(i, { required: e.target.checked })} /> verplicht</label>
                    <Button size="icon" variant="ghost" onClick={() => set("inputFields", cfg.inputFields.filter((_, j) => j !== i))} aria-label="Veld verwijderen" disabled={cfg.inputFields.length === 1}><X /></Button>
                  </div>
                  {f.type === "select" && <Input className="sm:col-span-4" placeholder="Opties, komma-gescheiden" value={(f.options ?? []).join(", ")} onChange={(e) => setField(i, { options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })} />}
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Databronnen, tools en uitvoer</CardTitle></CardHeader>
            <CardContent className="grid gap-4">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Kennisbanken</p>
                {options.knowledgeBases.map((kb) => (
                  <label key={kb.id} className="flex items-center gap-2 py-1 text-sm"><input type="checkbox" className="accent-[#14b8a6]" checked={cfg.knowledgeBaseIds.includes(kb.id)} onChange={() => set("knowledgeBaseIds", toggle(cfg.knowledgeBaseIds, kb.id))} /> {kb.name} <span className="text-xs text-muted-foreground">({kb.documents} doc.)</span></label>
                ))}
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tools</p>
                <div className="grid max-h-48 gap-0.5 overflow-y-auto sm:grid-cols-2">
                  {options.tools.map((t) => (
                    <label key={t.key} className="flex items-center gap-2 py-1 text-sm"><input type="checkbox" className="accent-[#14b8a6]" checked={cfg.toolKeys.includes(t.key)} onChange={() => set("toolKeys", toggle(cfg.toolKeys, t.key))} /> {t.name}</label>
                  ))}
                </div>
              </div>
              <Field label="Uitvoerformaat">
                <Select value={cfg.output.format} onChange={(e) => set("output", { ...cfg.output, format: e.target.value as AppConfig["output"]["format"] })}>
                  <option value="markdown">Opgemaakte tekst (Markdown)</option>
                  <option value="text">Platte tekst</option>
                  <option value="json_schema">Gestructureerd (JSON-schema)</option>
                </Select>
              </Field>
              {cfg.output.format === "json_schema" && <Field label="JSON-schema"><Textarea rows={8} className="font-mono text-xs" value={schemaText} onChange={(e) => setSchemaText(e.target.value)} /></Field>}
            </CardContent>
          </Card>
        </div>
      </TabsContent>
      <TabsContent value="test">
        <Card>
          <CardHeader><CardTitle>Testen</CardTitle><CardDescription>Test de opgeslagen versie. {app.status !== "published" && <Badge tone="warning">concept – alleen zichtbaar voor bouwers</Badge>}</CardDescription></CardHeader>
          <CardContent><AppRunner slug={slug} appId={app.id} fields={app.config.inputFields} /></CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
