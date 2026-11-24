"use client";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/context";
import { api, fmtBytes } from "@/lib/client";
import { Badge, ErrorBox, PageHeader } from "@/components/ui";

interface M { id: string; url: string; name: string; kind: string; size: number; width?: number; height?: number; duration?: number; source: string; provider?: string; colors?: string[]; rights: { confirmed: boolean; note?: string } }

export default function MediaPage() {
  const { t } = useT();
  const [list, setList] = useState<M[]>([]);
  const [filter, setFilter] = useState("");
  const [rights, setRights] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const load = () => api<M[]>("/api/media").then(setList);
  useEffect(() => { load(); }, []);
  const upload = async (files: FileList | null) => {
    if (!files) return;
    setErr("");
    if (!rights) return setErr(t.create.rights);
    for (const f of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("rights", "true");
      setBusy(f.name);
      try { await api("/api/media", { method: "POST", body: fd }); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    }
    setBusy("");
    load();
  };
  const studio = async (id: string, mode: "studio" | "openai") => {
    setBusy(id);
    setErr("");
    try { await api(`/api/media/${id}/studio`, { method: "POST", json: { mode } }); load(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy("");
  };
  const imp = async () => {
    setErr("");
    if (!rights) return setErr(t.create.rights);
    const r = await api<{ ok: boolean; error?: string }[]>("/api/media/import", { method: "POST", json: { urls: [importUrl], rights: true } }).catch((e) => { setErr(String(e.message)); return []; });
    if (r[0] && !r[0].ok) setErr(r[0].error ?? "");
    setImportUrl("");
    load();
  };
  const del = async (id: string) => { if (confirm(t.common.confirm)) { await api(`/api/media/${id}`, { method: "DELETE" }); load(); } };
  const shown = list.filter((m) => !filter || m.kind === filter);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t.media.title} subtitle={t.media.rightsNote} />
      <div className="card mb-4 space-y-3">
        <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} />{t.create.rights}</label>
        <label className={`flex h-24 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-line text-sm text-muted hover:border-accent ${!rights ? "opacity-50" : ""}`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files); }}>
          {busy && !busy.startsWith("med_") ? `${t.common.loading} ${busy}` : t.media.drop}
          <input type="file" multiple accept="image/*,video/*,audio/*" className="hidden" onChange={(e) => upload(e.target.files)} disabled={!rights} />
        </label>
        <div className="flex gap-2"><input className="input" placeholder={t.media.importUrl} value={importUrl} onChange={(e) => setImportUrl(e.target.value)} /><button className="btn-ghost" disabled={!importUrl} onClick={imp}>{t.common.add}</button></div>
        <ErrorBox error={err} />
      </div>
      <div className="mb-3 flex gap-2">{["", "image", "video", "audio", "render"].map((k) => <button key={k} className={`chip ${filter === k ? "chip-on" : ""}`} onClick={() => setFilter(k)}>{k || t.media.all}</button>)}</div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {shown.map((m) => (
          <div key={m.id} className="card space-y-1.5 p-2 text-xs">
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded bg-bg">
              {m.kind === "image" ? <img src={m.url} alt="" className="h-full w-full object-contain" /> : m.kind === "audio" ? <audio src={m.url} controls preload="none" className="w-full" /> : <video src={m.url} preload="metadata" controls className="h-full w-full" />}
            </div>
            <div className="truncate font-medium" title={m.name}>{m.name}</div>
            <div className="flex flex-wrap gap-1"><Badge>{m.kind}</Badge><Badge tone={m.source === "ai" || m.source === "tts" ? "info" : "muted"}>{m.provider ?? m.source}</Badge><span className="text-muted">{fmtBytes(m.size)}</span></div>
            {m.colors && <div className="flex gap-0.5">{m.colors.map((c) => <span key={c} className="h-3 w-3 rounded-sm" style={{ background: c }} />)}</div>}
            {m.rights.note && <div className="truncate text-[10px] text-muted" title={m.rights.note}>© {m.rights.note}</div>}
            <div className="flex gap-1">
              {m.kind === "image" && <button className="btn-ghost btn-xs" disabled={busy === m.id} onClick={() => studio(m.id, "studio")}>{t.media.studio}</button>}
              {m.kind === "image" && <button className="btn-ghost btn-xs" disabled={busy === m.id} onClick={() => studio(m.id, "openai")}>{t.media.aiScene}</button>}
              <button className="btn-ghost btn-xs ml-auto" onClick={() => del(m.id)}>🗑</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
