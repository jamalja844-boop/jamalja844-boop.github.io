"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PlayerRef } from "@remotion/player";
import { api, fmtDate } from "@/lib/client";
import { useT } from "@/lib/i18n/context";
import type { ProjectDoc } from "@/remotion/types";
import { useEditor } from "./useEditor";
import { Stage } from "./Stage";
import { Timeline } from "./Timeline";
import { Inspector } from "./Inspector";
import { LeftPanel } from "./LeftPanel";

interface Version { id: string; label: string; auto: boolean; createdAt: string }

export function EditorApp({ id, doc, updatedAt }: { id: string; doc: ProjectDoc; updatedAt: string }) {
  const { t } = useT();
  const router = useRouter();
  const ed = useEditor(id, doc, updatedAt);
  const playerRef = useRef<PlayerRef | null>(null);
  const [playing, setPlaying] = useState(false);
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [toast, setToast] = useState("");
  const edRef = useRef(ed);
  edRef.current = ed;

  const seek = useCallback((f: number) => {
    edRef.current.setFrame(f);
    playerRef.current?.seekTo(f);
  }, []);

  // player -> playhead sync
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    const onFrame = (e: { detail: { frame: number } }) => edRef.current.setFrame(e.detail.frame);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    p.addEventListener("frameupdate", onFrame);
    p.addEventListener("play", onPlay);
    p.addEventListener("pause", onPause);
    p.addEventListener("ended", onPause);
    return () => {
      p.removeEventListener("frameupdate", onFrame);
      p.removeEventListener("play", onPlay);
      p.removeEventListener("pause", onPause);
      p.removeEventListener("ended", onPause);
    };
  });

  const toggle = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    if (p.isPlaying()) p.pause();
    else {
      if (edRef.current.frame >= edRef.current.doc.durationInFrames - 1) p.seekTo(0);
      p.play();
    }
  }, []);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable) return;
      const cur = edRef.current;
      const mod = e.ctrlKey || e.metaKey;
      if (e.code === "Space") { e.preventDefault(); toggle(); }
      else if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) cur.redo(); else cur.undo(); }
      else if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); cur.redo(); }
      else if (mod && e.key.toLowerCase() === "d" && cur.selected) { e.preventDefault(); cur.duplicateClip(cur.selected); }
      else if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); void cur.persist(); }
      else if ((e.key === "Delete" || e.key === "Backspace") && cur.selected) { e.preventDefault(); cur.deleteClip(cur.selected); }
      else if (e.key.toLowerCase() === "s" && cur.selected) cur.splitClip(cur.selected, cur.frame);
      else if (e.key === "ArrowLeft" && !cur.selected) seek(Math.max(0, cur.frame - (e.shiftKey ? 10 : 1)));
      else if (e.key === "ArrowRight" && !cur.selected) seek(Math.min(cur.doc.durationInFrames - 1, cur.frame + (e.shiftKey ? 10 : 1)));
      else if (e.key.startsWith("Arrow") && cur.selected) {
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1;
        cur.updateClip(cur.selected, (c) => {
          if (e.key === "ArrowLeft") c.x -= d;
          if (e.key === "ArrowRight") c.x += d;
          if (e.key === "ArrowUp") c.y -= d;
          if (e.key === "ArrowDown") c.y += d;
        });
      } else if (e.key === "Escape") cur.setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, seek]);

  const loadVersions = async () => setVersions(await api<Version[]>(`/api/projects/${id}/versions`));
  const saveVersion = async () => {
    const label = prompt(t.editor.saveVersion, new Date().toLocaleString());
    if (!label) return;
    await ed.persist();
    await api(`/api/projects/${id}/versions`, { method: "POST", json: { label } });
    loadVersions();
  };
  const restore = async (vid: string) => {
    if (!confirm(t.common.confirm)) return;
    await ed.persist();
    const r = await api<{ doc: ProjectDoc; updatedAt: string }>(`/api/projects/${id}/versions/${vid}`, { method: "POST" });
    ed.updatedAt.current = r.updatedAt;
    ed.replace(r.doc);
    setVersions(null);
  };
  const exportMp4 = async (resolution: "1080p" | "4k") => {
    await ed.persist();
    await api("/api/renders", { method: "POST", json: { projectIds: [id], resolution } });
    setExportOpen(false);
    setToast(`${t.editor.export} → ${t.nav.renders}`);
  };
  const copyTo = async (aspect: string) => {
    await ed.persist();
    const r = await api<{ id: string }>(`/api/projects/${id}/duplicate`, { method: "POST", json: { aspect } });
    router.push(`/editor/${r.id}`);
  };
  const saveTemplate = async () => {
    await ed.persist();
    await api(`/api/projects/${id}/duplicate`, { method: "POST", json: { asTemplate: true, name: `${ed.doc.name} (template)` } });
    setToast(`✓ ${t.editor.saveTemplate}`);
  };

  const saveLabel = { saved: `✓ ${t.editor.autosaved}`, saving: t.common.saving, dirty: "●", error: `⚠ ${t.common.error}` }[ed.save];
  return (
    <div className="grid h-screen w-screen grid-cols-1 grid-rows-[48px_minmax(0,1fr)_minmax(220px,34vh)] overflow-hidden bg-bg text-gray-200">
      <header className="flex min-w-0 items-center gap-2 overflow-x-auto border-b border-line bg-panel px-3">
        <Link href="/projects" className="btn-ghost btn-xs">←</Link>
        <input className="w-64 min-w-0 shrink bg-transparent text-sm font-semibold outline-none" value={ed.doc.name} onChange={(e) => { const v = e.target.value; ed.update((d) => { d.name = v; }); }} />
        <span className={`whitespace-nowrap text-xs ${ed.save === "error" ? "text-red-300" : "text-muted"}`}>{saveLabel}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button className="btn-ghost btn-xs" onClick={ed.undo} title="Ctrl+Z">↶ {t.editor.undo}</button>
          <button className="btn-ghost btn-xs" onClick={ed.redo} title="Ctrl+Shift+Z">↷ {t.editor.redo}</button>
          <select className="input w-40 py-1 text-xs" value="" onChange={(e) => e.target.value && copyTo(e.target.value)}>
            <option value="">{t.editor.reformat}…</option>
            {["9:16", "16:9", "1:1", "4:5"].filter((a) => a !== ed.doc.aspect).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <button className="btn-ghost btn-xs" onClick={saveTemplate}>{t.editor.saveTemplate}</button>
          <button className="btn-ghost btn-xs" onClick={loadVersions}>⟲ {t.editor.versions}</button>
          <div className="relative">
            <button className="btn-primary btn-xs" onClick={() => setExportOpen(!exportOpen)}>⇩ {t.editor.export}</button>
            {exportOpen && (
              <div className="absolute right-0 top-8 z-50 w-56 space-y-1 rounded-lg border border-line bg-panel2 p-2 text-xs shadow-xl">
                <button className="btn-ghost w-full justify-start" onClick={() => exportMp4("1080p")}>MP4 · {ed.doc.width}×{ed.doc.height} (1080p)</button>
                <button className="btn-ghost w-full justify-start" onClick={() => exportMp4("4k")}>MP4 · {ed.doc.width * 2}×{ed.doc.height * 2} (4K)</button>
              </div>
            )}
          </div>
        </div>
      </header>
      <div className="grid min-h-0 grid-cols-[320px_minmax(0,1fr)_300px]">
        <aside className="min-h-0 border-r border-line bg-panel"><LeftPanel ed={ed} /></aside>
        <section className="min-h-0 min-w-0"><Stage ed={ed} playerRef={playerRef} playing={playing} /></section>
        <aside className="min-h-0 overflow-y-auto border-l border-line bg-panel"><Inspector ed={ed} /></aside>
      </div>
      <div className="min-h-0"><Timeline ed={ed} onSeek={seek} playing={playing} onTogglePlay={toggle} /></div>
      {versions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setVersions(null)}>
          <div className="card max-h-[70vh] w-[420px] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">{t.editor.versions}</h3><button className="btn-primary btn-xs" onClick={saveVersion}>+ {t.editor.saveVersion}</button></div>
            {versions.map((v) => (
              <div key={v.id} className="flex items-center justify-between border-b border-line py-2 text-sm">
                <span>{v.auto ? "⏱" : "★"} {v.label} <span className="text-xs text-muted">{fmtDate(v.createdAt)}</span></span>
                <button className="btn-ghost btn-xs" onClick={() => restore(v.id)}>{t.editor.restore}</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {toast && <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-emerald-600 px-4 py-2 text-sm" onClick={() => setToast("")}>{toast} <Link href="/renders" className="underline">→</Link></div>}
    </div>
  );
}
