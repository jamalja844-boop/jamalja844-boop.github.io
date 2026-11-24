"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Database, ExternalLink, Play, Plug, Plus, Save, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Badge, EmptyState, JsonView, StatusBadge } from "@/components/ui/misc";
import { Dialog, DialogContent, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { api, ClientApiError } from "@/lib/client/api";
import { formatDate, timeAgo } from "@/lib/utils";

interface Tool {
  id: string; key: string; name: string; description: string; handler: string; category: string; input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown> | null; config: Record<string, unknown>; risk_level: string; requires_approval: boolean; min_role: string;
  is_enabled: boolean; timeout_ms: number; executions: number; integration: string | null;
}
interface Integration { id: string; provider: string; label: string; value_hint: string; config: Record<string, unknown>; status: string; created_at: string }
interface Execution { id: string; tool_key: string; actor_type: string; status: string; error: string | null; duration_ms: number | null; injection_flags: string[]; created_at: string; input: unknown; output: unknown }
interface RecordRow { id: string; collection: string; title: string; data: Record<string, unknown>; status: string; is_demo: boolean; created_by_type: string; updated_at: string }
interface IntegrationDef { id: string; name: string; fields: { key: string; label: string; secret: boolean; placeholder?: string }[]; oauth: boolean; help: string }

const RISK: Record<string, { label: string; tone: "info" | "warning" | "danger" }> = {
  read: { label: "lezen", tone: "info" },
  write: { label: "schrijven", tone: "warning" },
  sensitive: { label: "gevoelig", tone: "danger" },
};
const CAT_LABEL: Record<string, string> = { kennis: "Kennis", bedrijfsdata: "Bedrijfsgegevens", communicatie: "Communicatie", agenda: "Agenda", documenten: "Documenten", "e-commerce": "E-commerce", integratie: "Integraties & API's", data: "Data", web: "Web", hulpmiddel: "Hulpmiddelen", algemeen: "Algemeen" };
const err = (e: unknown) => (e instanceof ClientApiError ? e.message : "Er ging iets mis");

function exampleInput(schema: Record<string, unknown>) {
  const props = (schema.properties ?? {}) as Record<string, { type?: string; enum?: string[] }>;
  const out: Record<string, unknown> = {};
  for (const k of (schema.required as string[] | undefined) ?? []) {
    const p = props[k];
    out[k] = p?.enum?.[0] ?? (p?.type === "integer" || p?.type === "number" ? 1 : p?.type === "object" ? {} : "");
  }
  return JSON.stringify(out, null, 2);
}

function ToolCard({ slug, tool, canManage, canExecute }: { slug: string; tool: Tool; canManage: boolean; canExecute: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [input, setInput] = useState(exampleInput(tool.input_schema));
  const [result, setResult] = useState<unknown>(null);
  const [running, setRunning] = useState(false);
  const [domains, setDomains] = useState(((tool.config.allowed_domains as string[]) ?? []).join(", "));
  const risk = RISK[tool.risk_level];

  async function patch(body: Record<string, unknown>) {
    try {
      await api.patch(`/api/w/${slug}/tools/${tool.id}`, body);
      router.refresh();
    } catch (e) {
      toast.error(err(e));
    }
  }
  async function run() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input);
    } catch {
      return toast.error("Invoer is geen geldige JSON");
    }
    setRunning(true);
    try {
      const r = await api.post(`/api/w/${slug}/tools/${tool.id}/execute`, { input: parsed });
      setResult(r);
      router.refresh();
    } catch (e) {
      toast.error(err(e));
    } finally {
      setRunning(false);
    }
  }
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-4" data-testid={`tool-${tool.key}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">{tool.name}</p>
          <p className="font-mono text-[11px] text-muted-foreground">{tool.key}</p>
        </div>
        <Switch checked={tool.is_enabled} disabled={!canManage} onCheckedChange={(v) => patch({ isEnabled: v })} aria-label={`${tool.name} inschakelen`} />
      </div>
      <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{tool.description}</p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge tone={risk.tone}>{risk.label}</Badge>
        {(tool.requires_approval || tool.risk_level === "sensitive") && <Badge tone="warning">goedkeuring</Badge>}
        {tool.integration && <Badge tone="info"><Plug className="size-3" /> {tool.integration}</Badge>}
        <span className="ml-auto text-xs text-muted-foreground">{tool.executions}× gebruikt</span>
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Details</Button>
        {canExecute && tool.is_enabled && <Button size="sm" variant="outline" onClick={() => setTestOpen(true)}><Play /> Testen</Button>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={tool.name} description="Inputschema, outputschema, rechtenmodel en foutafhandeling" wide>
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Minimale rol">
                <Select value={tool.min_role} disabled={!canManage} onChange={(e) => patch({ minRole: e.target.value })}>
                  {["viewer", "member", "developer", "admin", "owner"].map((r) => <option key={r} value={r}>{r}</option>)}
                </Select>
              </Field>
              <Field label="Time-out (ms)">
                <Input type="number" defaultValue={tool.timeout_ms} disabled={!canManage} onBlur={(e) => Number(e.target.value) !== tool.timeout_ms && patch({ timeoutMs: Number(e.target.value) })} />
              </Field>
              <Field label="Goedkeuring vooraf">
                <div className="flex h-10 items-center gap-2">
                  <Switch checked={tool.requires_approval || tool.risk_level === "sensitive"} disabled={!canManage || tool.risk_level === "sensitive"} onCheckedChange={(v) => patch({ requiresApproval: v })} />
                  <span className="text-xs text-muted-foreground">{tool.risk_level === "sensitive" ? "altijd (gevoelig)" : tool.handler === "http_request" ? "POST/PUT/PATCH/DELETE altijd" : ""}</span>
                </div>
              </Field>
            </div>
            {tool.handler === "http_request" && (
              <Field label="Toegestane domeinen" hint="Komma-gescheiden, bijv. api.voorbeeld.nl. Interne adressen zijn altijd geblokkeerd.">
                <div className="flex gap-2">
                  <Input value={domains} onChange={(e) => setDomains(e.target.value)} disabled={!canManage} />
                  {canManage && <Button variant="secondary" onClick={() => patch({ allowedDomains: domains.split(",").map((d) => d.trim()).filter(Boolean) })}><Save /> Opslaan</Button>}
                </div>
              </Field>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inputschema</p><JsonView value={tool.input_schema} /></div>
              <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Outputschema</p><JsonView value={tool.output_schema ?? {}} /></div>
            </div>
            <p className="text-xs text-muted-foreground">
              Foutafhandeling: ongeldige invoer wordt vóór uitvoering geweigerd met een duidelijke melding aan het model; time-outs en externe fouten worden gelogd;
              uitvoer wordt als onbetrouwbare data gemarkeerd en gecontroleerd op prompt-injectie.
            </p>
            {canManage && tool.handler === "http_request" && tool.key !== "http_request" && (
              <Button variant="danger" onClick={async () => { if (confirm("Tool verwijderen?")) { await api.del(`/api/w/${slug}/tools/${tool.id}`); router.refresh(); } }}><Trash2 /> Tool verwijderen</Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent title={`${tool.name} testen`} description="Wordt echt uitgevoerd met dezelfde rechten- en goedkeuringsregels als voor agents." wide>
          <div className="grid gap-3">
            <Field label="Invoer (JSON)"><Textarea rows={6} className="font-mono text-[12.5px]" value={input} onChange={(e) => setInput(e.target.value)} /></Field>
            <Button onClick={run} loading={running} variant="accent"><Play /> Uitvoeren</Button>
            {result !== null && <JsonView value={result} />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function IntegrationCard({ slug, def, connected, canManage, googleConfigured }: { slug: string; def: IntegrationDef; connected: Integration[]; canManage: boolean; googleConfigured: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>({});
  const [label, setLabel] = useState("standaard");
  const [loading, setLoading] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await api.post<{ tools?: string[] }>(`/api/w/${slug}/integrations`, { provider: def.id, label, values });
      toast.success(def.id === "mcp" ? `MCP-server gekoppeld: ${r.tools?.length ?? 0} tools geregistreerd (uitgeschakeld tot je ze activeert)` : "Integratie gekoppeld");
      setValues({});
      router.refresh();
    } catch (e) {
      toast.error(err(e));
    } finally {
      setLoading(false);
    }
  }
  async function remove(id: string) {
    if (!confirm("Koppeling verwijderen? Bijbehorende tools worden uitgeschakeld.")) return;
    await api.del(`/api/w/${slug}/integrations?id=${id}`);
    router.refresh();
  }
  const fields = def.id === "mcp" ? [{ key: "url", label: "Server-URL (https, Streamable HTTP)", secret: false, placeholder: "https://…/mcp" }, ...def.fields] : def.fields;
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>{def.name}</CardTitle>
          <CardDescription>{def.help}</CardDescription>
        </div>
        {connected.length ? <Badge tone="success">Gekoppeld</Badge> : <Badge>Niet gekoppeld</Badge>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {connected.map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">
              <b>{c.label}</b> · {(c.config.email as string) || (c.config.shop_domain as string) || (c.config.url as string) || c.value_hint} · {timeAgo(c.created_at)}
            </span>
            {canManage && <Button size="icon" variant="ghost" onClick={() => remove(c.id)} aria-label="Ontkoppelen"><Trash2 /></Button>}
          </div>
        ))}
        {canManage && (def.oauth ? (
          googleConfigured ? (
            <Button asChild variant="accent"><a href={`/api/w/${slug}/integrations/google/start`}><ExternalLink /> {connected.length ? "Opnieuw koppelen" : "Koppelen met Google"}</a></Button>
          ) : (
            <p className="rounded-xl border border-warning/40 bg-warning/8 p-3 text-sm">Nog in te stellen: GOOGLE_CLIENT_ID en GOOGLE_CLIENT_SECRET in de serverconfiguratie (.env), met redirect-URI <code className="font-mono text-xs">/api/integrations/google/callback</code>.</p>
          )
        ) : (
          <form onSubmit={save} className="flex flex-col gap-2">
            {(def.id === "mcp" || def.id === "http" || def.id === "sql") && (
              <Field label="Naam van de koppeling"><Input value={label} onChange={(e) => setLabel(e.target.value)} required /></Field>
            )}
            {fields.map((f) => (
              <Field key={f.key} label={f.label}>
                <Input type={f.secret ? "password" : "text"} autoComplete="off" placeholder={f.placeholder} value={values[f.key] ?? ""} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
              </Field>
            ))}
            <Button type="submit" loading={loading}><Plug /> {connected.length ? "Toevoegen / bijwerken" : "Koppelen"}</Button>
          </form>
        ))}
      </CardContent>
    </Card>
  );
}

function Records({ slug, initial, canDelete }: { slug: string; initial: { collections: { collection: string; n: number }[]; records: RecordRow[] }; canDelete: boolean }) {
  const [data, setData] = useState(initial);
  const [collection, setCollection] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<RecordRow | null>(null);
  async function load(c = collection, query = q) {
    const params = new URLSearchParams();
    if (c) params.set("collection", c);
    if (query) params.set("q", query);
    setData(await api.get(`/api/w/${slug}/records?${params}`));
  }
  async function remove(id: string) {
    if (!confirm("Record verwijderen?")) return;
    try {
      await api.del(`/api/w/${slug}/records/${id}`);
      setSelected(null);
      load();
    } catch (e) {
      toast.error(err(e));
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Database className="size-4" /> Interne bedrijfsgegevens</CardTitle>
        <CardDescription>Echte opslag binnen deze workspace (CRM, offertes, klachten, e-mailconcepten, AI-resultaten). Agents hebben alleen toegang tot hun toegewezen collecties.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={collection} onChange={(e) => { setCollection(e.target.value); load(e.target.value); }} className="sm:w-56" aria-label="Collectie">
            <option value="">Alle collecties</option>
            {data.collections.map((c) => <option key={c.collection} value={c.collection}>{c.collection} ({c.n})</option>)}
          </Select>
          <form onSubmit={(e) => { e.preventDefault(); load(); }} className="flex flex-1 gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoeken…" />
            <Button type="submit" variant="secondary"><Search /></Button>
          </form>
        </div>
        {data.records.length === 0 ? (
          <EmptyState icon={<Database />} title="Nog geen gegevens" description="Gegevens ontstaan wanneer gebruikers of agents tools zoals 'Bedrijfsgegeven aanmaken' of 'E-mailconcept opslaan' gebruiken, of wanneer je een AI-resultaat opslaat." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="py-2 pr-3">Titel</th><th className="pr-3">Collectie</th><th className="pr-3">Status</th><th className="pr-3">Door</th><th>Bijgewerkt</th></tr></thead>
              <tbody>
                {data.records.map((r) => (
                  <tr key={r.id} className="cursor-pointer border-b border-border/60 hover:bg-muted/50" onClick={() => setSelected(r)}>
                    <td className="py-2 pr-3 font-medium">{r.title} {r.is_demo && <Badge tone="demo">demo</Badge>}</td>
                    <td className="pr-3 font-mono text-xs">{r.collection}</td>
                    <td className="pr-3">{r.status}</td>
                    <td className="pr-3">{r.created_by_type}</td>
                    <td className="text-muted-foreground">{timeAgo(r.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Dialog open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)}>
          {selected && (
            <DialogContent title={selected.title} description={`${selected.collection} · ${formatDate(selected.updated_at)}`} wide>
              <JsonView value={selected.data} />
              {canDelete && <Button className="mt-3" variant="danger" onClick={() => remove(selected.id)}><Trash2 /> Verwijderen</Button>}
            </DialogContent>
          )}
        </Dialog>
      </CardContent>
    </Card>
  );
}

export function ToolManager(props: {
  slug: string;
  tab: string;
  tools: Tool[];
  integrations: Integration[];
  integrationDefs: IntegrationDef[];
  executions: Execution[];
  records: { collections: { collection: string; n: number }[]; records: RecordRow[] };
  can: { manage: boolean; execute: boolean; credentials: boolean; deleteRecords: boolean };
  googleConfigured: boolean;
  notice: string | null;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState({ key: "", name: "", description: "", domains: "" });
  const grouped = useMemo(() => {
    const f = filter.toLowerCase();
    const list = props.tools.filter((t) => !f || t.name.toLowerCase().includes(f) || t.key.includes(f) || t.description.toLowerCase().includes(f));
    return Object.entries(list.reduce<Record<string, Tool[]>>((acc, t) => ((acc[t.category] ??= []).push(t), acc), {}));
  }, [props.tools, filter]);

  async function createTool(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post(`/api/w/${props.slug}/tools`, { key: form.key, name: form.name, description: form.description, allowedDomains: form.domains.split(",").map((d) => d.trim()).filter(Boolean) });
      toast.success("REST-tool aangemaakt");
      setNewOpen(false);
      router.refresh();
    } catch (e2) {
      toast.error(err(e2));
    }
  }

  return (
    <Tabs defaultValue={props.tab}>
      {props.notice && <p className="mb-3 rounded-xl border border-border bg-muted/50 p-3 text-sm">{props.notice}</p>}
      <TabsList>
        <TabsTrigger value="tools">Tools ({props.tools.length})</TabsTrigger>
        <TabsTrigger value="integrations">Integraties</TabsTrigger>
        <TabsTrigger value="executions">Uitvoeringslog</TabsTrigger>
        <TabsTrigger value="records">Bedrijfsgegevens</TabsTrigger>
      </TabsList>

      <TabsContent value="tools" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input placeholder="Tools filteren…" value={filter} onChange={(e) => setFilter(e.target.value)} className="sm:max-w-xs" />
          {props.can.manage && <Button variant="secondary" onClick={() => setNewOpen(true)}><Plus /> Eigen REST-API-tool</Button>}
        </div>
        {grouped.map(([cat, tools]) => (
          <section key={cat}>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">{CAT_LABEL[cat] ?? cat}</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {tools.map((t) => <ToolCard key={t.id} slug={props.slug} tool={t} canManage={props.can.manage} canExecute={props.can.execute} />)}
            </div>
          </section>
        ))}
        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogContent title="Eigen REST-API-tool" description="Bijv. een CRM- of planningssysteem. Alleen toegestane domeinen; wijzigende verzoeken vereisen goedkeuring.">
            <form onSubmit={createTool} className="flex flex-col gap-3">
              <Field label="Sleutel" hint="kleine letters, cijfers en _"><Input required pattern="[a-z][a-z0-9_]{1,63}" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="crm_api" /></Field>
              <Field label="Naam"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="CRM-systeem" /></Field>
              <Field label="Omschrijving voor het model"><Textarea required minLength={10} rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
              <Field label="Toegestane domeinen"><Input required value={form.domains} onChange={(e) => setForm({ ...form, domains: e.target.value })} placeholder="api.mijncrm.nl" /></Field>
              <Button type="submit">Aanmaken</Button>
            </form>
          </DialogContent>
        </Dialog>
      </TabsContent>

      <TabsContent value="integrations" className="grid gap-4 lg:grid-cols-2">
        {props.integrationDefs.map((d) => (
          <IntegrationCard key={d.id} slug={props.slug} def={d} connected={props.integrations.filter((i) => i.provider === d.id)} canManage={props.can.credentials} googleConfigured={props.googleConfigured} />
        ))}
      </TabsContent>

      <TabsContent value="executions">
        <Card>
          <CardHeader><CardTitle>Uitvoeringslog</CardTitle><CardDescription>Laatste 100 tooluitvoeringen door gebruikers, chats, apps, agents en workflows.</CardDescription></CardHeader>
          <CardContent className="overflow-x-auto">
            {props.executions.length === 0 ? <p className="text-sm text-muted-foreground">Nog geen uitvoeringen.</p> : (
              <table className="w-full min-w-[720px] text-sm">
                <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="py-2 pr-3">Tijd</th><th className="pr-3">Tool</th><th className="pr-3">Door</th><th className="pr-3">Status</th><th className="pr-3">Duur</th><th>Melding</th></tr></thead>
                <tbody>
                  {props.executions.map((x) => (
                    <tr key={x.id} className="border-b border-border/60 align-top">
                      <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">{formatDate(x.created_at)}</td>
                      <td className="pr-3 font-mono text-xs">{x.tool_key}</td>
                      <td className="pr-3">{x.actor_type}</td>
                      <td className="pr-3"><StatusBadge status={x.status} /></td>
                      <td className="pr-3 tabular-nums">{x.duration_ms ?? "–"} ms</td>
                      <td className="max-w-xs truncate text-xs text-muted-foreground">{x.error ?? (x.injection_flags.length ? `⚠ ${x.injection_flags.join(", ")}` : "")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="records">
        <Records slug={props.slug} initial={props.records} canDelete={props.can.deleteRecords} />
      </TabsContent>
    </Tabs>
  );
}
