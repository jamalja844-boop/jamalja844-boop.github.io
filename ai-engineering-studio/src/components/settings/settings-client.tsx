"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleCheck, CircleX, Copy, KeyRound, RefreshCw, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Badge, StatusBadge } from "@/components/ui/misc";
import { Switch, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { api, ClientApiError } from "@/lib/client/api";
import { formatDate, formatUsd, timeAgo } from "@/lib/utils";

interface Provider { provider: string; configured: boolean; source: string; hint: string | null; status: string | null; lastError: string | null; lastVerifiedAt: string | null }
interface Model { id: string; provider: string; model_id: string; display_name: string; kind: string; input_price: string | null; output_price: string | null; is_enabled: boolean; is_default: boolean; source: string; verified_at: string | null; context_window: number | null }
interface Member { user_id: string; name: string; email: string; role: string; created_at: string }
interface AuditRow { id: number; action: string; actor_name: string | null; actor_label: string | null; target_type: string | null; target_id: string | null; created_at: string; metadata: unknown }

const ROLE_LABELS: Record<string, string> = { owner: "Eigenaar", admin: "Beheerder", developer: "Ontwikkelaar", member: "Medewerker", viewer: "Kijker" };
const PROVIDER_INFO: Record<string, { name: string; placeholder: string; help: string }> = {
  anthropic: { name: "Anthropic (Claude)", placeholder: "sk-ant-…", help: "Maak een sleutel aan op console.anthropic.com → API Keys." },
  openai: { name: "OpenAI", placeholder: "sk-…", help: "Maak een sleutel aan op platform.openai.com → API keys. Na koppelen worden de beschikbare modellen opgehaald." },
};

function err(e: unknown) {
  return e instanceof ClientApiError ? e.message : "Er ging iets mis";
}

function ProviderCard({ slug, p, canManage }: { slug: string; p: Provider; canManage: boolean }) {
  const router = useRouter();
  const info = PROVIDER_INFO[p.provider];
  const [key, setKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [loading, setLoading] = useState(false);
  if (!info) return null;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await api.post<{ verified: boolean; warning: string | null; synced: number }>(`/api/w/${slug}/settings/providers`, { provider: p.provider, apiKey: key, baseUrl });
      if (r.verified) toast.success(`${info.name} gekoppeld · ${r.synced} modellen gevonden`);
      else toast.warning(r.warning ?? "Opgeslagen, niet geverifieerd");
      setKey("");
      router.refresh();
    } catch (e) {
      toast.error(err(e));
    } finally {
      setLoading(false);
    }
  }
  async function remove() {
    if (!confirm(`Sleutel voor ${info.name} verwijderen?`)) return;
    await api.del(`/api/w/${slug}/settings/providers?provider=${p.provider}`);
    toast.success("Sleutel verwijderd");
    router.refresh();
  }
  async function sync() {
    setLoading(true);
    try {
      const r = await api.post<{ count: number }>(`/api/w/${slug}/models/sync`, { provider: p.provider });
      toast.success(`${r.count} modellen gesynchroniseerd`);
      router.refresh();
    } catch (e) {
      toast.error(err(e));
    } finally {
      setLoading(false);
    }
  }
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>{info.name}</CardTitle>
          <CardDescription>{info.help}</CardDescription>
        </div>
        {p.configured ? (
          p.status === "invalid" ? <Badge tone="warning">Niet geverifieerd</Badge> : <Badge tone="success"><CircleCheck className="size-3" /> Gekoppeld</Badge>
        ) : (
          <Badge tone="neutral"><CircleX className="size-3" /> Niet ingesteld</Badge>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {p.configured && (
          <div className="rounded-xl bg-muted/60 p-3 text-sm">
            <p>Sleutel: <span className="font-mono">{p.hint}</span> <span className="text-muted-foreground">({p.source === "server" ? "serverconfiguratie" : "workspace"})</span></p>
            {p.lastVerifiedAt && <p className="text-xs text-muted-foreground">Laatst geverifieerd {timeAgo(p.lastVerifiedAt)}</p>}
            {p.lastError && <p className="mt-1 text-xs text-warning">{p.lastError}</p>}
          </div>
        )}
        {canManage && (
          <form onSubmit={save} className="flex flex-col gap-3">
            <Field label={p.configured ? "Nieuwe sleutel" : "API-sleutel"} htmlFor={`key-${p.provider}`}>
              <Input id={`key-${p.provider}`} type="password" autoComplete="off" placeholder={info.placeholder} value={key} onChange={(e) => setKey(e.target.value)} required />
            </Field>
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Geavanceerd</summary>
              <Field label="Eigen base-URL (optioneel, https)" className="mt-2">
                <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://…" />
              </Field>
            </details>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={loading} disabled={!key}><KeyRound /> Opslaan &amp; verifiëren</Button>
              {p.configured && <Button type="button" variant="secondary" onClick={sync} loading={loading}><RefreshCw /> Modellen synchroniseren</Button>}
              {p.configured && p.source === "workspace" && <Button type="button" variant="danger" onClick={remove}><Trash2 /> Verwijderen</Button>}
            </div>
          </form>
        )}
        <p className="text-xs text-muted-foreground">Sleutels worden versleuteld (AES-256-GCM) op de server bewaard en nooit naar de browser gestuurd.</p>
      </CardContent>
    </Card>
  );
}

function ModelsTable({ slug, models, canManage }: { slug: string; models: Model[]; canManage: boolean }) {
  const router = useRouter();
  // Optimistische weergave: keuzes zijn direct zichtbaar, de server bevestigt op de achtergrond.
  const [defaults, setDefaults] = useState<Record<string, string>>(() => Object.fromEntries(models.filter((m) => m.is_default).map((m) => [m.kind, m.id])));
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => Object.fromEntries(models.map((m) => [m.id, m.is_enabled])));
  async function patch(id: string, body: Record<string, unknown>, rollback?: () => void) {
    try {
      await api.patch(`/api/w/${slug}/models/${id}`, body);
      router.refresh();
    } catch (e) {
      rollback?.();
      toast.error(err(e));
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Modellen</CardTitle>
        <CardDescription>Alleen modellen die door de provider bestaan worden aangeboden. Prijzen in USD per 1 miljoen tokens; zonder prijs worden kosten als &ldquo;onbekend&rdquo; geregistreerd.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-3">Model</th><th className="pr-3">Provider</th><th className="pr-3">Type</th><th className="pr-3">Invoer $</th><th className="pr-3">Uitvoer $</th><th className="pr-3">Standaard</th><th>Actief</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.id} className="border-b border-border/60">
                <td className="py-2 pr-3">
                  <p className="font-medium">{m.display_name}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">{m.model_id}{m.verified_at ? " · geverifieerd" : ""}</p>
                </td>
                <td className="pr-3">{m.provider === "demo" ? <Badge tone="demo">demo</Badge> : m.provider}</td>
                <td className="pr-3">{m.kind === "chat" ? "chat" : "embedding"}</td>
                <td className="pr-3">
                  <PriceInput disabled={!canManage} value={m.input_price} onSave={(v) => patch(m.id, { inputPrice: v })} />
                </td>
                <td className="pr-3">
                  <PriceInput disabled={!canManage} value={m.output_price} onSave={(v) => patch(m.id, { outputPrice: v })} />
                </td>
                <td className="pr-3">
                  <input type="radio" name={`default-${m.kind}`} checked={defaults[m.kind] === m.id} disabled={!canManage} onChange={() => { const prev = defaults; setDefaults({ ...defaults, [m.kind]: m.id }); patch(m.id, { isDefault: true }, () => setDefaults(prev)); }} aria-label="Standaardmodel" className="accent-[#14b8a6]" />
                </td>
                <td><Switch checked={enabled[m.id]} disabled={!canManage} onCheckedChange={(v) => { setEnabled({ ...enabled, [m.id]: v }); patch(m.id, { isEnabled: v }, () => setEnabled((e) => ({ ...e, [m.id]: !v }))); }} aria-label="Model actief" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function PriceInput({ value, onSave, disabled }: { value: string | null; onSave: (v: number | null) => void; disabled?: boolean }) {
  const [v, setV] = useState(value === null ? "" : String(Number(value)));
  return (
    <input
      className="h-8 w-20 rounded-lg border border-input bg-card px-2 text-sm tabular-nums"
      value={v}
      disabled={disabled}
      placeholder="?"
      inputMode="decimal"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const n = v.trim() === "" ? null : Number(v.replace(",", "."));
        if (n !== null && !Number.isFinite(n)) return toast.error("Ongeldige prijs");
        if ((value === null ? null : Number(value)) !== n) onSave(n);
      }}
      aria-label="Prijs per miljoen tokens"
    />
  );
}

function OrgForm({ slug, org, canManage }: { slug: string; org: { name: string; description: string; retentionDays: number; monthlyBudgetUsd: number | null }; canManage: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: org.name, description: org.description, retentionDays: String(org.retentionDays), monthlyBudgetUsd: org.monthlyBudgetUsd === null ? "" : String(org.monthlyBudgetUsd) });
  const [loading, setLoading] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.patch(`/api/w/${slug}/settings/org`, {
        name: form.name,
        description: form.description,
        retentionDays: Number(form.retentionDays),
        monthlyBudgetUsd: form.monthlyBudgetUsd === "" ? null : Number(form.monthlyBudgetUsd),
      });
      toast.success("Opgeslagen");
      router.refresh();
    } catch (e) {
      toast.error(err(e));
    } finally {
      setLoading(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Workspace</CardTitle>
        <CardDescription>Naam, budget en AVG-bewaartermijn. Gesprekken, tooluitvoeringen en runs ouder dan de bewaartermijn worden automatisch verwijderd.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="grid gap-4 md:grid-cols-2">
          <Field label="Naam"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!canManage} /></Field>
          <Field label="Maandbudget AI-kosten (USD)" hint="Leeg = geen limiet. Bij overschrijding worden AI-aanroepen geblokkeerd.">
            <Input inputMode="decimal" value={form.monthlyBudgetUsd} onChange={(e) => setForm({ ...form, monthlyBudgetUsd: e.target.value })} disabled={!canManage} />
          </Field>
          <Field label="Bewaartermijn (dagen)" hint="Tussen 7 en 3650 dagen (AVG).">
            <Input type="number" min={7} max={3650} value={form.retentionDays} onChange={(e) => setForm({ ...form, retentionDays: e.target.value })} disabled={!canManage} />
          </Field>
          <Field label="Omschrijving" className="md:col-span-2"><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} disabled={!canManage} /></Field>
          {canManage && <div><Button type="submit" loading={loading}>Opslaan</Button></div>}
        </form>
      </CardContent>
    </Card>
  );
}

function Members({ slug, members, canManage, currentUserId }: { slug: string; members: Member[]; canManage: boolean; currentUserId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [link, setLink] = useState<string | null>(null);
  async function invite(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await api.post<{ url: string }>(`/api/w/${slug}/members`, { email, role });
      setLink(r.url);
      setEmail("");
      toast.success("Uitnodiging aangemaakt");
    } catch (e) {
      toast.error(err(e));
    }
  }
  async function changeRole(userId: string, r: string) {
    try {
      await api.patch(`/api/w/${slug}/members/${userId}`, { role: r });
      toast.success("Rol gewijzigd");
      router.refresh();
    } catch (e) {
      toast.error(err(e));
    }
  }
  async function remove(userId: string) {
    if (!confirm("Lid verwijderen uit deze workspace?")) return;
    try {
      await api.del(`/api/w/${slug}/members/${userId}`);
      router.refresh();
    } catch (e) {
      toast.error(err(e));
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Leden en rollen</CardTitle>
        <CardDescription>Eigenaar en Beheerder beheren alles; Ontwikkelaar bouwt modellen, prompts, apps, tools en agents; Medewerker gebruikt ze; Kijker heeft alleen leestoegang.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="divide-y divide-border">
          {members.map((m) => (
            <li key={m.user_id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{m.name} {m.user_id === currentUserId && <span className="text-xs text-muted-foreground">(jij)</span>}</p>
                <p className="text-xs text-muted-foreground">{m.email} · lid sinds {formatDate(m.created_at, false)}</p>
              </div>
              {canManage && m.user_id !== currentUserId ? (
                <div className="flex gap-2">
                  <Select value={m.role} onChange={(e) => changeRole(m.user_id, e.target.value)} className="h-9 w-40">
                    {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                  <Button size="icon" variant="ghost" onClick={() => remove(m.user_id)} aria-label="Verwijderen"><Trash2 /></Button>
                </div>
              ) : (
                <Badge>{ROLE_LABELS[m.role]}</Badge>
              )}
            </li>
          ))}
        </ul>
        {canManage && (
          <form onSubmit={invite} className="flex flex-col gap-2 rounded-xl border border-border p-3 sm:flex-row">
            <Input type="email" required placeholder="e-mailadres" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Select value={role} onChange={(e) => setRole(e.target.value)} className="sm:w-44">
              {["admin", "developer", "member", "viewer"].map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </Select>
            <Button type="submit"><UserPlus /> Uitnodigen</Button>
          </form>
        )}
        {link && (
          <div className="rounded-xl border border-turq-400/40 bg-turq-400/8 p-3 text-sm">
            <p className="font-medium">Uitnodigingslink (7 dagen geldig, eenmalig):</p>
            <div className="mt-1 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate font-mono text-xs">{link}</code>
              <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard.writeText(link); toast.success("Gekopieerd"); }}><Copy /> Kopiëren</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SettingsClient(props: {
  slug: string;
  tab: string;
  providers: Provider[];
  models: Model[];
  members: Member[];
  audit: AuditRow[];
  org: { name: string; description: string; retentionDays: number; monthlyBudgetUsd: number | null };
  can: { credentials: boolean; models: boolean; org: boolean; members: boolean; audit: boolean };
  currentUserId: string;
  usage: { cost_month: number | null; tokens_month: number };
}) {
  return (
    <Tabs defaultValue={props.tab}>
      <TabsList>
        <TabsTrigger value="providers">AI-providers</TabsTrigger>
        <TabsTrigger value="models">Modellen</TabsTrigger>
        <TabsTrigger value="workspace">Workspace &amp; AVG</TabsTrigger>
        <TabsTrigger value="members">Leden</TabsTrigger>
        {props.can.audit && <TabsTrigger value="audit">Auditlog</TabsTrigger>}
      </TabsList>
      <TabsContent value="providers" className="grid gap-4 lg:grid-cols-2">
        {props.providers.filter((p) => p.provider !== "demo").map((p) => <ProviderCard key={p.provider} slug={props.slug} p={p} canManage={props.can.credentials} />)}
        {props.providers.some((p) => p.provider === "demo") && (
          <Card className="lg:col-span-2 border-fuchsia-400/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">Demo-simulator <Badge tone="demo">geen echte AI</Badge></CardTitle>
              <CardDescription>Lokale, deterministische simulator om de applicatie te testen zonder API-sleutels. Antwoorden zijn altijd gemarkeerd. Uit te schakelen met ENABLE_DEMO_PROVIDER=false.</CardDescription>
            </CardHeader>
          </Card>
        )}
      </TabsContent>
      <TabsContent value="models">
        <ModelsTable slug={props.slug} models={props.models} canManage={props.can.models} />
      </TabsContent>
      <TabsContent value="workspace" className="grid gap-4">
        <OrgForm slug={props.slug} org={props.org} canManage={props.can.org} />
        <Card>
          <CardHeader><CardTitle>Verbruik deze maand</CardTitle></CardHeader>
          <CardContent className="text-sm">{props.usage.tokens_month.toLocaleString("nl-NL")} tokens · {formatUsd(props.usage.cost_month, 2)}</CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="members">
        <Members slug={props.slug} members={props.members} canManage={props.can.members} currentUserId={props.currentUserId} />
      </TabsContent>
      {props.can.audit && (
        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <CardTitle>Auditlog</CardTitle>
              <CardDescription>Onveranderlijk logboek van beheeracties, sleutelwijzigingen, goedkeuringen en tooluitvoeringen (laatste 200).</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="py-2 pr-3">Tijdstip</th><th className="pr-3">Actie</th><th className="pr-3">Door</th><th>Doel</th></tr></thead>
                <tbody>
                  {props.audit.map((a) => (
                    <tr key={a.id} className="border-b border-border/60 align-top">
                      <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">{formatDate(a.created_at)}</td>
                      <td className="pr-3"><StatusBadge status={a.action} /></td>
                      <td className="pr-3">{a.actor_label ?? a.actor_name ?? "systeem"}</td>
                      <td className="font-mono text-xs text-muted-foreground">{a.target_type}{a.target_id ? ` · ${a.target_id.slice(0, 18)}` : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      )}
    </Tabs>
  );
}
