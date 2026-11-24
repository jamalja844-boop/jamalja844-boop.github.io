"use client";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/context";
import { api, fmtDate } from "@/lib/client";
import { PROVIDERS } from "@/lib/providers/registry";
import { Badge, ErrorBox, PageHeader, statusTone } from "@/components/ui";

interface Job { id: string; status: string; createdAt: string; error?: string; input: { provider: string; prompt: string }; result?: { assetId?: string }; steps: { message?: string }[] }
interface Media { id: string; url: string; name: string; kind: string }

export default function AiVideo() {
  const { t } = useT();
  const [provs, setProvs] = useState<{ id: string; configured: boolean; enabled: boolean }[]>([]);
  const [provider, setProvider] = useState("");
  const [prompt, setPrompt] = useState("");
  const [image, setImage] = useState("");
  const [aspect, setAspect] = useState("9:16");
  const [seconds, setSeconds] = useState(5);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [images, setImages] = useState<Media[]>([]);
  const [err, setErr] = useState("");
  const load = () => api<Job[]>("/api/aivideo").then(setJobs).catch(() => {});
  useEffect(() => {
    api<typeof provs>("/api/settings/providers").then((p) => {
      setProvs(p);
      const first = ["runway", "gemini", "kling"].find((id) => p.some((x) => x.id === id && x.configured && x.enabled));
      if (first) setProvider(first);
    });
    api<Media[]>("/api/media?kind=image").then(setImages);
    load();
  }, []);
  // poll running jobs (each poll advances the external task)
  useEffect(() => {
    const running = jobs.filter((j) => j.status === "running");
    if (!running.length) return;
    const tm = setTimeout(async () => { await Promise.all(running.map((j) => api(`/api/jobs/${j.id}`).catch(() => null))); load(); }, 5000);
    return () => clearTimeout(tm);
  }, [jobs]);
  const ready = PROVIDERS.filter((p) => ["runway", "gemini", "kling"].includes(p.id) && provs.some((x) => x.id === p.id && x.configured && x.enabled));
  const start = async () => {
    setErr("");
    try { await api("/api/aivideo", { method: "POST", json: { provider, prompt, imageAssetId: image || undefined, aspect, seconds } }); load(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t.aivideo.title} subtitle={t.aivideo.subtitle} />
      <div className="card mb-6 space-y-3">
        {!ready.length && <p className="text-sm text-amber-300">{t.aivideo.notConfigured}</p>}
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="block"><span className="label">{t.aivideo.provider}</span><select className="input" value={provider} onChange={(e) => setProvider(e.target.value)}>{ready.map((p) => <option key={p.id} value={p.id}>{p.id === "gemini" ? "Google Veo (Gemini API)" : p.name}</option>)}</select></label>
          <label className="block"><span className="label">Format</span><select className="input" value={aspect} onChange={(e) => setAspect(e.target.value)}>{["9:16", "16:9", "1:1"].map((a) => <option key={a}>{a}</option>)}</select></label>
          <label className="block"><span className="label">{t.create.duration}</span><select className="input" value={seconds} onChange={(e) => setSeconds(+e.target.value)}>{[5, 8, 10].map((a) => <option key={a} value={a}>{a}s</option>)}</select></label>
          <label className="block"><span className="label">{t.aivideo.startImage}</span><select className="input" value={image} onChange={(e) => setImage(e.target.value)}><option value="">—</option>{images.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
        </div>
        <textarea className="input h-24" placeholder={t.aivideo.prompt} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        <ErrorBox error={err} />
        <button className="btn-primary" disabled={!provider || prompt.length < 3} onClick={start}>◉ {t.aivideo.start}</button>
      </div>
      <h2 className="mb-3 font-semibold">{t.aivideo.history}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {jobs.map((j) => (
          <div key={j.id} className="card space-y-2 text-sm">
            <div className="flex items-center justify-between"><Badge>{j.input.provider}</Badge><Badge tone={statusTone(j.status)}>{j.status}</Badge></div>
            <p className="line-clamp-2 text-xs text-muted">{j.input.prompt}</p>
            {j.result?.assetId && <video src={`/api/files/${j.result.assetId}`} controls className="w-full rounded" />}
            {j.error && <p className="text-xs text-red-300">{j.error}</p>}
            <div className="text-[10px] text-muted">{fmtDate(j.createdAt)} · {j.steps[0]?.message}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
