"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarClock, CheckCircle2, CircleAlert, Clock, Download, FileSpreadsheet, FileText, FolderOpen, Hourglass, Pencil, Play, Plus, Trash2,
} from "lucide-react";
import { SLASH_COMMANDS } from "@workstudio/shared";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Badge, EmptyState, Spinner } from "@/components/ui/misc";
import { Dialog, DialogContent, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { api, ClientApiError } from "@/lib/client/api";
import { cn, formatDate, timeAgo } from "@/lib/utils";
import { describeSchedule, FREQUENCY_LABEL, WEEKDAY_LABEL, type Frequency } from "@/lib/cowork/schedule";
import type { StyleOption } from "@/components/chat/chat-workspace";

interface FileRow { id: string; filename: string; format: string; size_bytes: number; source: string; conversation_id: string | null; conversation_title: string | null; created_at: string }
interface AttachmentRow { id: string; filename: string; file_type: string; size_bytes: number; pages: number | null; chars: number; injection_flags: string[]; conversation_id: string | null; conversation_title: string | null; created_at: string }
interface Schedule {
  id: string; name: string; prompt: string; frequency: Frequency; time_of_day: string; weekday: number | null; day_of_month: number | null; run_once_at: string | null;
  timezone: string; provider: string | null; model_id: string | null; style_id: string | null; enabled: boolean; next_run_at: string | null; last_run_at: string | null;
  last_status: string | null; run_count: number;
}
interface Run { id: string; task_id: string; trigger: string; status: string; conversation_id: string | null; document_id: string | null; file_id: string | null; summary: string | null; error: string | null; created_at: string; finished_at: string | null; document_title: string | null; filename: string | null }

const formatBytes = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const RUN_STATUS: Record<string, { label: string; tone: "neutral" | "turq" | "success" | "danger" }> = {
  queued: { label: "In wachtrij", tone: "neutral" }, running: { label: "Bezig", tone: "turq" }, succeeded: { label: "Klaar", tone: "success" }, failed: { label: "Mislukt", tone: "danger" },
};

const EXAMPLES = [
  { name: "Weekoverzicht klantvragen", prompt: "/summarize Maak een kort weekoverzicht van de belangrijkste aandachtspunten voor klantenservice deze week, met acties.", frequency: "weekly" as Frequency, weekday: 1, time: "08:15" },
  { name: "Maandelijkse nieuwsbrief", prompt: "/create Nieuwsbrief voor zakelijke klanten met tips voor een schone werkplek in dit seizoen", frequency: "monthly" as Frequency, day: 1, time: "09:10" },
  { name: "Urenoverzicht-sjabloon", prompt: "/excel Urenregistratie per medewerker per dag voor deze week met totalen", frequency: "weekdays" as Frequency, time: "07:40" },
];

export function CoworkClient({ slug, models, styles }: { slug: string; models: { value: string; label: string; available: boolean }[]; styles: StyleOption[] }) {
  const search = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState(search.get("tab") === "planner" ? "planner" : "files");
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-sky-strong dark:text-brand-sky">Cowork</p>
        <h1 className="text-2xl font-semibold tracking-tight">Bestanden en geplande taken</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Gemaakte Excel-, Word- en PDF-bestanden, je bijlagen uit AI Chat en taken die automatisch op vaste momenten een concept voor je klaarzetten.</p>
      </div>
      <Tabs value={tab} onValueChange={(v) => { setTab(v); router.replace(`/w/${slug}/cowork${v === "planner" ? "?tab=planner" : ""}`, { scroll: false }); }}>
        <TabsList>
          <TabsTrigger value="files"><FolderOpen className="size-4" /> Bestanden</TabsTrigger>
          <TabsTrigger value="planner"><CalendarClock className="size-4" /> Taakplanner</TabsTrigger>
        </TabsList>
        <TabsContent value="files"><FilesTab slug={slug} /></TabsContent>
        <TabsContent value="planner"><PlannerTab slug={slug} models={models} styles={styles} /></TabsContent>
      </Tabs>
    </div>
  );
}

function FilesTab({ slug }: { slug: string }) {
  const [data, setData] = useState<{ files: FileRow[]; attachments: AttachmentRow[] } | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await api.get(`/api/w/${slug}/files`));
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Laden mislukt");
    }
  }, [slug]);
  useEffect(() => {
    load();
  }, [load]);
  async function del(url: string, what: string) {
    if (!confirm(`${what} definitief verwijderen?`)) return;
    try {
      await api.del(url);
      await load();
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Verwijderen mislukt");
    }
  }
  if (!data) return <div className="flex justify-center py-12"><Spinner /></div>;
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-semibold">Gemaakte bestanden</h2>
        <p className="mb-4 text-sm text-muted-foreground">Uit <code>/excel</code> in AI Chat en uit geplande taken.</p>
        {data.files.length === 0 ? (
          <EmptyState icon={<FileSpreadsheet />} title="Nog geen bestanden" description="Typ in AI Chat bijvoorbeeld: /excel urenoverzicht per medewerker per week" />
        ) : (
          <ul className="divide-y divide-border" data-testid="generated-files">
            {data.files.map((f) => (
              <li key={f.id} className="flex items-center gap-3 py-2.5">
                <FileSpreadsheet className="size-5 shrink-0 text-turq-600 dark:text-turq-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{f.filename}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatBytes(f.size_bytes)} · {f.source === "schedule" ? "Geplande taak" : "AI Chat"} · {timeAgo(f.created_at)}
                    {f.conversation_id && <> · <Link className="underline" href={`/w/${slug}/chat?c=${f.conversation_id}`}>{f.conversation_title ?? "gesprek"}</Link></>}
                  </p>
                </div>
                <Button asChild size="sm" variant="secondary"><a href={`/api/w/${slug}/files/${f.id}`}><Download /> Download</a></Button>
                <Button size="icon" variant="ghost" onClick={() => del(`/api/w/${slug}/files/${f.id}`, f.filename)} aria-label={`Verwijder ${f.filename}`}><Trash2 /></Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-semibold">Bijlagen uit AI Chat</h2>
        <p className="mb-4 text-sm text-muted-foreground">Alleen de tekst wordt bewaard (niet het originele bestand), zichtbaar voor jou alleen.</p>
        {data.attachments.length === 0 ? (
          <EmptyState icon={<FileText />} title="Nog geen bijlagen" description="Sleep een PDF, Word-, Excel- of CSV-bestand in AI Chat." />
        ) : (
          <ul className="divide-y divide-border">
            {data.attachments.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2.5">
                {a.file_type === "xlsx" || a.file_type === "csv" ? <FileSpreadsheet className="size-5 shrink-0 text-turq-600" /> : <FileText className="size-5 shrink-0 text-brand-sky-strong" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.filename}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.file_type.toUpperCase()} · {formatBytes(a.size_bytes)}{a.pages ? ` · ${a.pages} pagina's` : ""} · {a.chars.toLocaleString("nl-NL")} tekens · {timeAgo(a.created_at)}
                    {a.conversation_id && <> · <Link className="underline" href={`/w/${slug}/chat?c=${a.conversation_id}`}>{a.conversation_title ?? "gesprek"}</Link></>}
                  </p>
                </div>
                {a.injection_flags.length > 0 && <Badge tone="warning" title={a.injection_flags.join(", ")}>verdachte tekst</Badge>}
                <Button size="icon" variant="ghost" onClick={() => del(`/api/w/${slug}/chat/attachments/${a.id}`, a.filename)} aria-label={`Verwijder ${a.filename}`}><Trash2 /></Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

interface FormState {
  id?: string; name: string; prompt: string; frequency: Frequency; timeOfDay: string; weekday: number; dayOfMonth: number; runOnceAt: string; model: string; styleId: string; enabled: boolean;
}

function PlannerTab({ slug, models, styles }: { slug: string; models: { value: string; label: string; available: boolean }[]; styles: StyleOption[] }) {
  const [data, setData] = useState<{ schedules: Schedule[]; runs: Run[] } | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `/api/w/${slug}/schedules`;
  const load = useCallback(async () => {
    try {
      setData(await api.get(base));
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Laden mislukt");
    }
  }, [base]);
  useEffect(() => {
    load();
  }, [load]);
  const active = data?.runs.some((r) => r.status === "queued" || r.status === "running");
  useEffect(() => {
    if (!active) return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [active, load]);

  const blank = (): FormState => ({ name: "", prompt: "", frequency: "weekly", timeOfDay: "08:30", weekday: 1, dayOfMonth: 1, runOnceAt: "", model: "", styleId: "", enabled: true });

  async function save() {
    if (!form) return;
    setBusy(true);
    try {
      const [provider, ...rest] = form.model ? form.model.split("::") : [];
      const body = {
        name: form.name, prompt: form.prompt, frequency: form.frequency, timeOfDay: form.timeOfDay,
        weekday: form.frequency === "weekly" ? form.weekday : null, dayOfMonth: form.frequency === "monthly" ? form.dayOfMonth : null,
        runOnceAt: form.frequency === "once" && form.runOnceAt ? new Date(form.runOnceAt).toISOString() : null,
        timezone: "Europe/Amsterdam", provider: provider ?? null, modelId: rest.join("::") || null, styleId: form.styleId || null, enabled: form.enabled,
      };
      if (form.id) await api.patch(`${base}/${form.id}`, body);
      else await api.post(base, body);
      toast.success("Geplande taak opgeslagen");
      setForm(null);
      await load();
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Opslaan mislukt");
    } finally {
      setBusy(false);
    }
  }

  async function act(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      toast.success(ok);
      await load();
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Actie mislukt");
    }
  }

  if (!data) return <div className="flex justify-center py-12"><Spinner /></div>;
  const writingCommands = SLASH_COMMANDS.filter((c) => !["code", "browser"].includes(c.name));

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Geplande taken</h2>
            <p className="text-sm text-muted-foreground">Op het ingestelde moment voert AI de opdracht uit en zet het resultaat als <strong>concept</strong> in de Schrijfstudio of bij Bestanden. Er wordt nooit iets verstuurd of gepubliceerd.</p>
          </div>
          <Button variant="accent" onClick={() => setForm(blank())} data-testid="new-schedule"><Plus /> Nieuwe taak</Button>
        </div>
        {data.schedules.length === 0 ? (
          <div className="grid gap-3">
            <EmptyState icon={<CalendarClock />} title="Nog geen geplande taken" description="Begin met een voorbeeld of maak je eigen taak." />
            <div className="grid gap-2 sm:grid-cols-3">
              {EXAMPLES.map((ex) => (
                <button key={ex.name} onClick={() => setForm({ ...blank(), name: ex.name, prompt: ex.prompt, frequency: ex.frequency, timeOfDay: ex.time, weekday: ex.weekday ?? 1, dayOfMonth: ex.day ?? 1 })}
                  className="rounded-xl border border-border bg-background p-3 text-left text-sm hover:border-brand-sky/50 hover:bg-muted">
                  <span className="font-medium">{ex.name}</span>
                  <span className="mt-1 block truncate font-mono text-[11px] text-muted-foreground">{ex.prompt}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="grid gap-3" data-testid="schedule-list">
            {data.schedules.map((t) => {
              const runs = data.runs.filter((r) => r.task_id === t.id).slice(0, 5);
              return (
                <li key={t.id} className={cn("rounded-xl border border-border p-4", !t.enabled && "opacity-70")}>
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{t.name}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <Clock className="size-3.5" />
                        {describeSchedule({ frequency: t.frequency, timeOfDay: t.time_of_day, weekday: t.weekday, dayOfMonth: t.day_of_month, runOnceAt: t.run_once_at ? new Date(t.run_once_at) : null })}
                        {t.enabled && t.next_run_at ? <> · volgende: {formatDate(t.next_run_at)}</> : <> · gepauzeerd</>}
                        {t.run_count > 0 && <> · {t.run_count}× uitgevoerd</>}
                      </p>
                      <p className="mt-2 truncate rounded-lg bg-muted/60 px-2 py-1 font-mono text-[12px]">{t.prompt}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Switch checked={t.enabled} onCheckedChange={(v) => act(() => api.patch(`${base}/${t.id}`, { enabled: v }), v ? "Taak ingeschakeld" : "Taak gepauzeerd")} aria-label={t.enabled ? "Pauzeren" : "Inschakelen"} />
                      <Button size="sm" variant="secondary" onClick={() => act(() => api.post(`${base}/${t.id}/run`), "Taak gestart")} data-testid="run-now"><Play /> Nu uitvoeren</Button>
                      <Button size="icon" variant="ghost" aria-label="Bewerken" onClick={() => setForm({
                        id: t.id, name: t.name, prompt: t.prompt, frequency: t.frequency, timeOfDay: t.time_of_day, weekday: t.weekday ?? 1, dayOfMonth: t.day_of_month ?? 1,
                        runOnceAt: t.run_once_at ? new Date(t.run_once_at).toISOString().slice(0, 16) : "", model: t.provider && t.model_id ? `${t.provider}::${t.model_id}` : "",
                        styleId: t.style_id ?? "", enabled: t.enabled,
                      })}><Pencil /></Button>
                      <Button size="icon" variant="ghost" aria-label="Verwijderen" onClick={() => confirm(`"${t.name}" verwijderen?`) && act(() => api.del(`${base}/${t.id}`), "Taak verwijderd")}><Trash2 /></Button>
                    </div>
                  </div>
                  {runs.length > 0 && (
                    <ul className="mt-3 grid gap-1.5 border-t border-border pt-3" data-testid="schedule-runs">
                      {runs.map((r) => (
                        <li key={r.id} className="flex flex-wrap items-center gap-2 text-[13px]" data-status={r.status}>
                          {r.status === "succeeded" ? <CheckCircle2 className="size-4 text-turq-500" /> : r.status === "failed" ? <CircleAlert className="size-4 text-danger" /> : r.status === "running" ? <Spinner className="size-4" /> : <Hourglass className="size-4 text-muted-foreground" />}
                          <Badge tone={RUN_STATUS[r.status]?.tone ?? "neutral"}>{RUN_STATUS[r.status]?.label ?? r.status}</Badge>
                          <span className="text-xs text-muted-foreground">{r.trigger === "manual" ? "handmatig" : "gepland"} · {timeAgo(r.created_at)}</span>
                          {r.document_id && <Link className="font-medium text-brand-sky-strong hover:underline dark:text-brand-sky" href={`/w/${slug}/writing?doc=${r.document_id}`}>{r.document_title ?? "Document"} →</Link>}
                          {r.file_id && <a className="font-medium text-brand-sky-strong hover:underline dark:text-brand-sky" href={`/api/w/${slug}/files/${r.file_id}`}>{r.filename ?? "Bestand"} ↓</a>}
                          {r.conversation_id && <Link className="text-xs underline text-muted-foreground" href={`/w/${slug}/chat?c=${r.conversation_id}`}>gesprek</Link>}
                          {r.error && <span className="w-full text-xs text-danger">{r.error}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <aside className="h-fit rounded-2xl border border-border bg-card p-5 text-sm">
        <h3 className="font-semibold">Zo werkt de taakplanner</h3>
        <ul className="mt-2 grid gap-2 text-muted-foreground">
          <li>• Gebruik een gewone vraag of een opdracht: {writingCommands.map((c) => `/${c.name}`).join(", ")}.</li>
          <li>• Tijden zijn Nederlandse tijd (zomer- en wintertijd automatisch).</li>
          <li>• Het resultaat komt als concept in de Schrijfstudio (of als Excel bij Bestanden). Jij beslist wat ermee gebeurt.</li>
          <li>• <code>/code</code> en <code>/browser</code> kunnen niet worden ingepland.</li>
          <li>• De worker moet draaien (<code>npm run worker</code> of <code>RUN_WORKER_IN_WEB=true</code>).</li>
        </ul>
        <Alert tone="info" title="Privé">Geplande taken en resultaten zijn alleen zichtbaar voor jou.</Alert>
      </aside>

      <Dialog open={Boolean(form)} onOpenChange={(o) => !o && setForm(null)}>
        {form && (
          <DialogContent title={form.id ? "Geplande taak bewerken" : "Nieuwe geplande taak"} description="Het resultaat wordt altijd als concept opgeslagen.">
            <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
              <Field label="Naam" htmlFor="sc-name"><Input id="sc-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} maxLength={120} /></Field>
              <Field label="Opdracht" htmlFor="sc-prompt" hint="Bijv. /create nieuwsbrief over … of /excel planning per week">
                <Textarea id="sc-prompt" rows={4} value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} required minLength={3} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Herhaling" htmlFor="sc-freq">
                  <Select id="sc-freq" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as Frequency })}>
                    {(Object.keys(FREQUENCY_LABEL) as Frequency[]).map((f) => <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>)}
                  </Select>
                </Field>
                {form.frequency === "once" ? (
                  <Field label="Datum en tijd" htmlFor="sc-once"><Input id="sc-once" type="datetime-local" value={form.runOnceAt} onChange={(e) => setForm({ ...form, runOnceAt: e.target.value })} required /></Field>
                ) : (
                  <Field label="Tijd" htmlFor="sc-time"><Input id="sc-time" type="time" value={form.timeOfDay} onChange={(e) => setForm({ ...form, timeOfDay: e.target.value })} required /></Field>
                )}
              </div>
              {form.frequency === "weekly" && (
                <Field label="Dag" htmlFor="sc-wd">
                  <Select id="sc-wd" value={form.weekday} onChange={(e) => setForm({ ...form, weekday: Number(e.target.value) })}>
                    {[1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>{WEEKDAY_LABEL[d]}</option>)}
                  </Select>
                </Field>
              )}
              {form.frequency === "monthly" && (
                <Field label="Dag van de maand" htmlFor="sc-dom"><Input id="sc-dom" type="number" min={1} max={31} value={form.dayOfMonth} onChange={(e) => setForm({ ...form, dayOfMonth: Number(e.target.value) })} /></Field>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="AI-model" htmlFor="sc-model">
                  <Select id="sc-model" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}>
                    <option value="">Standaardmodel</option>
                    {models.map((m) => <option key={m.value} value={m.value} disabled={!m.available}>{m.label}</option>)}
                  </Select>
                </Field>
                <Field label="Schrijfstijl" htmlFor="sc-style">
                  <Select id="sc-style" value={form.styleId} onChange={(e) => setForm({ ...form, styleId: e.target.value })}>
                    <option value="">Standaard</option>
                    {styles.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[#14b8a6]" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> Ingeschakeld</label>
              <Button type="submit" variant="accent" loading={busy} data-testid="save-schedule">{form.id ? "Opslaan" : "Taak inplannen"}</Button>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
