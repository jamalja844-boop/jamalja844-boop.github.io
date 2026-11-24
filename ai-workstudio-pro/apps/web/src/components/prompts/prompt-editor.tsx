"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bot, CircleCheck, CircleX, FlaskConical, History, Plus, Save, Star, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Badge, JsonView } from "@/components/ui/misc";
import { Markdown } from "@/components/chat/markdown";
import { ModelSelect, defaultModel, parseModelValue } from "@/components/shared/model-select";
import { api, ClientApiError } from "@/lib/client/api";
import type { StudioOptions } from "@/lib/studio-options";
import { cn, formatDate, formatNumber, formatUsd } from "@/lib/utils";

interface Variable { name: string; description?: string; default?: string; required?: boolean }
interface Version {
  version: number; role: string; context: string; goal: string; system_prompt: string; user_template: string; variables: Variable[];
  output_format: "text" | "markdown" | "json" | "json_schema"; output_schema: Record<string, unknown> | null; model_provider: string | null;
  model_id: string | null; temperature: string | null; notes: string; created_at: string;
}
interface Run {
  id: string; prompt_version: number; batch_id: string; provider: string; model_id: string; output: string | null; output_json: unknown;
  json_valid: boolean | null; status: string; error: string | null; input_tokens: number; output_tokens: number; cost_usd: string | null;
  latency_ms: number | null; rating: number | null; created_at: string;
}
interface TestResult {
  id: string; variant: { version: number; provider: string; modelId: string }; status: string; error: string | null; output: string; outputJson: unknown;
  jsonValid: boolean | null; inputTokens: number; outputTokens: number; costUsd: number | null; latencyMs: number; renderedSystem: string; renderedUser: string;
}

const VAR_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]{0,40})\s*\}\}/g;
const detect = (...t: string[]) => [...new Set(t.flatMap((x) => [...x.matchAll(VAR_RE)].map((m) => m[1])))];

export function PromptEditor({ slug, prompt, versions, runs, agents, options, canManage }: {
  slug: string;
  prompt: { id: string; name: string; description: string; tags: string[]; current_version: number };
  versions: Version[];
  runs: Run[];
  agents: { id: string; name: string }[];
  options: StudioOptions;
  canManage: boolean;
}) {
  const router = useRouter();
  const current = versions.find((v) => v.version === prompt.current_version) ?? versions[0];
  const [draft, setDraft] = useState<Version>(current);
  const [schemaText, setSchemaText] = useState(current?.output_schema ? JSON.stringify(current.output_schema, null, 2) : '{\n  "type": "object",\n  "properties": {\n    "samenvatting": { "type": "string" }\n  },\n  "required": ["samenvatting"]\n}');
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [variants, setVariants] = useState<{ version: number; model: string }[]>([{ version: prompt.current_version, model: defaultModel(options.models) }]);
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});

  const detected = useMemo(() => detect(draft.system_prompt, draft.user_template, draft.role, draft.context, draft.goal), [draft]);
  const vars: Variable[] = detected.map((n) => draft.variables.find((v) => v.name === n) ?? { name: n, required: true });
  const set = <K extends keyof Version>(k: K, v: Version[K]) => setDraft({ ...draft, [k]: v });
  const setVar = (name: string, patch: Partial<Variable>) => set("variables", vars.map((v) => (v.name === name ? { ...v, ...patch } : v)));

  let schemaError: string | null = null;
  let parsedSchema: Record<string, unknown> | null = null;
  if (draft.output_format === "json_schema") {
    try {
      parsedSchema = JSON.parse(schemaText);
    } catch (e) {
      schemaError = `Ongeldige JSON: ${(e as Error).message}`;
    }
  }

  async function saveVersion() {
    if (schemaError) return toast.error(schemaError);
    setSaving(true);
    try {
      const r = await api.post<{ version: number }>(`/api/w/${slug}/prompts/${prompt.id}/versions`, {
        role: draft.role, context: draft.context, goal: draft.goal, system_prompt: draft.system_prompt, user_template: draft.user_template,
        variables: vars, output_format: draft.output_format, output_schema: draft.output_format === "json_schema" ? parsedSchema : null,
        model_provider: draft.model_provider, model_id: draft.model_id, temperature: draft.temperature === null || draft.temperature === "" ? null : Number(draft.temperature), notes,
      });
      toast.success(`Versie ${r.version} opgeslagen`);
      setNotes("");
      setVariants((vs) => vs.map((v, i) => (i === 0 ? { ...v, version: r.version } : v)));
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Opslaan mislukt");
    } finally {
      setSaving(false);
    }
  }

  async function activate(version: number) {
    await api.patch(`/api/w/${slug}/prompts/${prompt.id}`, { currentVersion: version });
    toast.success(`Versie ${version} is nu actief`);
    router.refresh();
  }

  async function runTest() {
    setTesting(true);
    setResults(null);
    try {
      const r = await api.post<{ results: TestResult[] }>(`/api/w/${slug}/prompts/${prompt.id}/test`, {
        variants: variants.filter((v) => v.model).map((v) => ({ version: v.version, ...parseModelValue(v.model) })),
        variables: values,
      });
      setResults(r.results);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Test mislukt");
    } finally {
      setTesting(false);
    }
  }

  async function rate(runId: string, rating: number) {
    setRatings({ ...ratings, [runId]: rating });
    await api.patch(`/api/w/${slug}/prompts/${prompt.id}/runs/${runId}`, { rating });
  }

  async function remove() {
    if (!confirm("Prompt met alle versies en testresultaten verwijderen?")) return;
    await api.del(`/api/w/${slug}/prompts/${prompt.id}`);
    router.push(`/w/${slug}/prompts`);
  }

  const allVars = [...new Set([...detected])];

  return (
    <div className="grid gap-6 2xl:grid-cols-[1fr_380px]">
      <div className="flex min-w-0 flex-col gap-6">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Visuele prompteditor</CardTitle>
              <CardDescription>Bewerken start vanaf versie {draft.version}. Opslaan maakt altijd een nieuwe versie.</CardDescription>
            </div>
            {canManage && <Button variant="ghost" size="icon" onClick={remove} aria-label="Prompt verwijderen"><Trash2 /></Button>}
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field label="Rol" hint="Wie is de AI? Bijv. 'Ervaren offertespecialist in de schoonmaakbranche'">
              <Textarea rows={3} value={draft.role} onChange={(e) => set("role", e.target.value)} disabled={!canManage} />
            </Field>
            <Field label="Doel" hint="Wat moet het resultaat bereiken?">
              <Textarea rows={3} value={draft.goal} onChange={(e) => set("goal", e.target.value)} disabled={!canManage} />
            </Field>
            <Field label="Context" className="md:col-span-2" hint="Achtergrondinformatie. Gebruik {{variabelen}} voor invulbare waarden.">
              <Textarea rows={4} value={draft.context} onChange={(e) => set("context", e.target.value)} disabled={!canManage} />
            </Field>
            <Field label="Systeeminstructies (aanvullend)" className="md:col-span-2">
              <Textarea rows={5} className="font-mono text-[13px]" value={draft.system_prompt} onChange={(e) => set("system_prompt", e.target.value)} disabled={!canManage} />
            </Field>
            <Field label="Gebruikersprompt (template)" className="md:col-span-2" hint="Bijv. 'Maak een offerte voor {{klant}} voor {{m2}} m² kantoorschoonmaak.'">
              <Textarea rows={5} className="font-mono text-[13px]" value={draft.user_template} onChange={(e) => set("user_template", e.target.value)} disabled={!canManage} />
            </Field>
            <Field label="Uitvoerformaat">
              <Select value={draft.output_format} onChange={(e) => set("output_format", e.target.value as Version["output_format"])} disabled={!canManage}>
                <option value="text">Tekst</option>
                <option value="markdown">Markdown</option>
                <option value="json">JSON (vrij)</option>
                <option value="json_schema">JSON volgens schema (gestructureerd)</option>
              </Select>
            </Field>
            <Field label="Temperatuur (optioneel)" hint="Alleen voor modellen die dit ondersteunen; huidige Claude-modellen negeren dit.">
              <Input inputMode="decimal" value={draft.temperature ?? ""} onChange={(e) => set("temperature", e.target.value)} disabled={!canManage} placeholder="standaard" />
            </Field>
            {draft.output_format === "json_schema" && (
              <Field label="JSON-schema" className="md:col-span-2" error={schemaError}>
                <Textarea rows={8} className="font-mono text-[12.5px]" value={schemaText} onChange={(e) => setSchemaText(e.target.value)} disabled={!canManage} />
              </Field>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Variabelen</CardTitle>
            <CardDescription>Automatisch gedetecteerd uit {"{{naam}}"} in de teksten.</CardDescription>
          </CardHeader>
          <CardContent>
            {vars.length === 0 ? (
              <p className="text-sm text-muted-foreground">Geen variabelen. Voeg bijvoorbeeld {"{{klant}}"} toe aan de gebruikersprompt.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {vars.map((v) => (
                  <div key={v.name} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[140px_1fr_1fr_auto] sm:items-center">
                    <code className="font-mono text-sm font-semibold">{v.name}</code>
                    <Input placeholder="Omschrijving" value={v.description ?? ""} onChange={(e) => setVar(v.name, { description: e.target.value })} disabled={!canManage} />
                    <Input placeholder="Standaardwaarde" value={v.default ?? ""} onChange={(e) => setVar(v.name, { default: e.target.value })} disabled={!canManage} />
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[#14b8a6]" checked={v.required ?? true} onChange={(e) => setVar(v.name, { required: e.target.checked })} disabled={!canManage} /> verplicht</label>
                  </div>
                ))}
              </div>
            )}
            {canManage && (
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
                <Field label="Versienotitie" className="flex-1"><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Wat is er veranderd?" /></Field>
                <Button onClick={saveVersion} loading={saving} disabled={Boolean(schemaError)}><Save /> Opslaan als nieuwe versie</Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FlaskConical className="size-4 text-turq-500" /> Testen &amp; vergelijken</CardTitle>
            <CardDescription>Test tot 4 varianten (versies × modellen) naast elkaar. Resultaten, tokens, kosten en JSON-validiteit worden opgeslagen.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {allVars.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {allVars.map((n) => (
                  <Field key={n} label={n}>
                    <Input value={values[n] ?? ""} placeholder={vars.find((v) => v.name === n)?.default ?? ""} onChange={(e) => setValues({ ...values, [n]: e.target.value })} />
                  </Field>
                ))}
              </div>
            )}
            <div className="flex flex-col gap-2">
              {variants.map((v, i) => (
                <div key={i} className="flex flex-col gap-2 sm:flex-row">
                  <Select className="sm:w-36" value={v.version} onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, version: Number(e.target.value) } : x)))} aria-label="Versie">
                    {versions.map((ver) => <option key={ver.version} value={ver.version}>Versie {ver.version}</option>)}
                  </Select>
                  <ModelSelect models={options.models} value={v.model} onChange={(m) => setVariants(variants.map((x, j) => (j === i ? { ...x, model: m } : x)))} className="flex-1" />
                  {variants.length > 1 && <Button variant="ghost" size="icon" onClick={() => setVariants(variants.filter((_, j) => j !== i))} aria-label="Variant verwijderen"><X /></Button>}
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                {variants.length < 4 && <Button variant="secondary" size="sm" onClick={() => setVariants([...variants, { ...variants[variants.length - 1] }])}><Plus /> Variant toevoegen</Button>}
                <Button variant="accent" onClick={runTest} loading={testing} disabled={!canManage}><FlaskConical /> {variants.length > 1 ? "Vergelijk varianten" : "Test uitvoeren"}</Button>
              </div>
            </div>
            {results && (
              <div className={cn("grid gap-3", results.length > 1 && "lg:grid-cols-2")}>
                {results.map((r) => (
                  <div key={r.id ?? r.variant.modelId} className="flex flex-col gap-2 rounded-2xl border border-border p-4" data-testid="test-result">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="info">v{r.variant.version}</Badge>
                      <span className="text-sm font-semibold">{r.variant.modelId}</span>
                      {r.variant.provider === "demo" && <Badge tone="demo">demo</Badge>}
                      {r.jsonValid !== null && (r.jsonValid ? <Badge tone="success"><CircleCheck className="size-3" /> JSON geldig</Badge> : <Badge tone="danger"><CircleX className="size-3" /> JSON ongeldig</Badge>)}
                    </div>
                    {r.status === "failed" ? (
                      <p className="text-sm text-danger">{r.error}</p>
                    ) : r.outputJson ? (
                      <JsonView value={r.outputJson} />
                    ) : (
                      <div className="max-h-80 overflow-y-auto rounded-xl bg-muted/50 p-3"><Markdown text={r.output} /></div>
                    )}
                    <p className="text-xs text-muted-foreground">{formatNumber(r.latencyMs)} ms · {formatNumber(r.inputTokens)} in / {formatNumber(r.outputTokens)} uit · {formatUsd(r.costUsd)}</p>
                    {r.id && (
                      <div className="flex items-center gap-1" aria-label="Beoordeling">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button key={n} onClick={() => rate(r.id, n)} aria-label={`${n} sterren`}>
                            <Star className={cn("size-4", (ratings[r.id] ?? 0) >= n ? "fill-warning text-warning" : "text-muted-foreground")} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><History className="size-4" /> Versiegeschiedenis</CardTitle></CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1.5">
              {versions.map((v) => (
                <li key={v.version} className={cn("rounded-xl border border-border p-3", v.version === prompt.current_version && "border-turq-400/50 bg-turq-400/5")}>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Versie {v.version}</span>
                    {v.version === prompt.current_version && <Badge tone="success">actief</Badge>}
                    <span className="ml-auto text-xs text-muted-foreground">{formatDate(v.created_at)}</span>
                  </div>
                  {v.notes && <p className="mt-1 text-xs text-muted-foreground">{v.notes}</p>}
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => { setDraft(v); if (v.output_schema) setSchemaText(JSON.stringify(v.output_schema, null, 2)); }}>Laden</Button>
                    {canManage && v.version !== prompt.current_version && <Button size="sm" variant="outline" onClick={() => activate(v.version)}>Maak actief</Button>}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Bot className="size-4" /> Gekoppeld aan agents</CardTitle></CardHeader>
          <CardContent>
            {agents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nog niet gekoppeld. Koppel deze prompt in de Agent Builder.</p>
            ) : (
              <ul className="flex flex-col gap-1">{agents.map((a) => <li key={a.id}><Link className="text-sm font-medium text-brand-sky-strong hover:underline dark:text-brand-sky" href={`/w/${slug}/agents/${a.id}`}>{a.name}</Link></li>)}</ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Eerdere tests</CardTitle></CardHeader>
          <CardContent>
            {runs.length === 0 ? <p className="text-sm text-muted-foreground">Nog geen tests.</p> : (
              <ul className="flex flex-col divide-y divide-border">
                {runs.slice(0, 15).map((r) => (
                  <li key={r.id} className="py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Badge tone="info">v{r.prompt_version}</Badge>
                      <span className="truncate">{r.model_id}</span>
                      {r.status === "failed" && <Badge tone="danger">mislukt</Badge>}
                      {r.json_valid === false && <Badge tone="danger">JSON ✗</Badge>}
                      {r.rating && <span className="ml-auto text-xs text-warning">{"★".repeat(r.rating)}</span>}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{r.error ?? r.output}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
