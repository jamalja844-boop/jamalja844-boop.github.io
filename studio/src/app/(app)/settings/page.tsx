"use client";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/context";
import { api } from "@/lib/client";
import { PROVIDERS, type ProviderDef } from "@/lib/providers/registry";
import { Badge, PageHeader } from "@/components/ui";

interface State { id: string; configured: boolean; enabled: boolean; masked: string; settings: Record<string, string> }

function ProviderCard({ def, st, reload }: { def: ProviderDef; st?: State; reload: () => void }) {
  const { t } = useT();
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<Record<string, string>>(st?.settings ?? {});
  const [enabled, setEnabled] = useState(st?.enabled ?? true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; models?: string[]; voices?: { id: string; name: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setSettings(st?.settings ?? {}); setEnabled(st?.enabled ?? true); }, [st]);
  const save = async () => {
    setBusy(true);
    try { await api(`/api/settings/providers/${def.id}`, { method: "PUT", json: { credentials: creds, settings, enabled } }); setCreds({}); setMsg({ ok: true, text: t.common.saved }); reload(); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
    setBusy(false);
  };
  const test = async () => {
    setBusy(true);
    try { const r = await api<{ ok: boolean; message: string; models?: string[]; voices?: { id: string; name: string }[] }>(`/api/settings/providers/${def.id}/test`, { method: "POST" }); setMsg({ ok: r.ok, text: r.message, models: r.models, voices: r.voices }); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
    setBusy(false);
  };
  const remove = async () => { if (confirm(t.common.confirm)) { await api(`/api/settings/providers/${def.id}`, { method: "DELETE" }); reload(); } };
  const unavailable = def.status !== "available";
  return (
    <div className={`card space-y-3 ${unavailable ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{def.name}</div>
          <div className="mt-1 flex flex-wrap gap-1">{def.categories.map((c) => <Badge key={c}>{c}</Badge>)}{st?.configured && <Badge tone="ok">{st.masked}</Badge>}{unavailable && <Badge tone="warn">{t.settings.unavailable}</Badge>}</div>
        </div>
        <div className="flex gap-2 text-xs"><a className="text-accent2" href={def.docsUrl} target="_blank" rel="noreferrer">{t.settings.docs}</a>{def.pricingUrl && <a className="text-accent2" href={def.pricingUrl} target="_blank" rel="noreferrer">{t.settings.pricing}</a>}</div>
      </div>
      {unavailable ? <p className="text-xs text-muted">{def.statusNote}</p> : (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            {def.credentials.map((f) => (
              <label key={f.key} className="block text-xs"><span className="label">{f.label}</span><input type="password" autoComplete="off" className="input" placeholder={st?.configured ? t.settings.keepKey : f.placeholder} value={creds[f.key] ?? ""} onChange={(e) => setCreds({ ...creds, [f.key]: e.target.value })} />{f.help && <span className="text-[10px] text-muted">{f.help}</span>}</label>
            ))}
            {def.settings.map((f) => (
              <label key={f.key} className="block text-xs"><span className="label">{f.label}</span>
                {f.options ? <select className="input" value={settings[f.key] ?? f.default ?? ""} onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value })}>{f.options.map((o) => <option key={o}>{o}</option>)}</select>
                  : <input className="input" list={`${def.id}-${f.key}`} placeholder={f.placeholder} value={settings[f.key] ?? f.default ?? ""} onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value })} />}
                {f.key === "model" && msg?.models && <datalist id={`${def.id}-${f.key}`}>{msg.models.map((m) => <option key={m} value={m} />)}</datalist>}
                {f.key === "voiceId" && msg?.voices && <datalist id={`${def.id}-${f.key}`}>{msg.voices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</datalist>}
                {f.help && <span className="text-[10px] text-muted">{f.help}</span>}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />{t.settings.enabled}</label>
            <button className="btn-primary btn-xs" disabled={busy} onClick={save}>{t.common.save}</button>
            <button className="btn-ghost btn-xs" disabled={busy || !st?.configured} onClick={test}>{t.common.test}</button>
            {st?.configured && <button className="btn-ghost btn-xs" onClick={remove}>{t.settings.remove}</button>}
            {msg && <span className={`text-xs ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>{msg.text}{msg.models ? ` · ${msg.models.length} ${t.settings.models}` : ""}{msg.voices ? ` · ${msg.voices.length} ${t.settings.voices}` : ""}</span>}
          </div>
          {msg?.voices && <div className="max-h-24 overflow-y-auto text-[10px] text-muted">{msg.voices.map((v) => <button key={v.id} className="mr-2 underline" onClick={() => setSettings({ ...settings, voiceId: v.id })}>{v.name}</button>)}</div>}
        </>
      )}
    </div>
  );
}

export default function Settings() {
  const { t } = useT();
  const [state, setState] = useState<State[]>([]);
  const load = () => api<State[]>("/api/settings/providers").then(setState);
  useEffect(() => { load(); }, []);
  const groups: [string, ProviderDef[]][] = [
    ["Text (LLM)", PROVIDERS.filter((p) => p.categories.includes("llm"))],
    ["Voice-over (TTS)", PROVIDERS.filter((p) => p.categories.includes("tts") && !p.categories.includes("llm"))],
    ["Video", PROVIDERS.filter((p) => p.categories.includes("video") && !p.categories.includes("llm"))],
    ["Social media", PROVIDERS.filter((p) => p.categories.includes("social"))],
    [t.settings.integrations, PROVIDERS.filter((p) => p.categories.includes("commerce"))],
  ];
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t.settings.title} subtitle={t.settings.subtitle} />
      {groups.map(([g, defs]) => (
        <div key={g} id={g === "Social media" ? "social" : undefined} className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{g}</h2>
          <div className="grid gap-4 lg:grid-cols-2">{defs.map((d) => <ProviderCard key={d.id} def={d} st={state.find((s) => s.id === d.id)} reload={load} />)}</div>
        </div>
      ))}
    </div>
  );
}
