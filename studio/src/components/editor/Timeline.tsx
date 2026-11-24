"use client";
// Multitrack timeline: move/trim clips (with snapping), move between tracks, split,
// scene strip, keyframe markers, audio waveforms and a scrubbable playhead.
import React, { useEffect, useRef, useState } from "react";
import { uid } from "@/remotion/defaults";
import type { Clip, ProjectDoc, TrackKind } from "@/remotion/types";
import { useT } from "@/lib/i18n/context";
import type { EditorApi } from "./useEditor";

const ROW = 40;
const HEAD = 150;

const COLORS: Record<string, string> = {
  text: "#7c5cff", caption: "#a855f7", image: "#0ea5e9", video: "#0284c7", product3d: "#06b6d4", phone: "#0891b2", background: "#334155",
  shape: "#f59e0b", button: "#ef4444", price: "#f97316", logo: "#eab308", illustration: "#84cc16", particles: "#14b8a6", transition: "#ec4899", audio: "#10b981",
};

const peaksCache = new Map<string, Promise<number[]>>();
function usePeaks(src: string | undefined) {
  const [peaks, setPeaks] = useState<number[] | null>(null);
  useEffect(() => {
    if (!src) return;
    if (!peaksCache.has(src)) {
      peaksCache.set(src, (async () => {
        const buf = await (await fetch(src)).arrayBuffer();
        const ctx = new AudioContext();
        const audio = await ctx.decodeAudioData(buf);
        void ctx.close();
        const data = audio.getChannelData(0);
        const perSec = 50;
        const n = Math.ceil(audio.duration * perSec);
        const step = Math.floor(data.length / n);
        const out: number[] = [];
        for (let i = 0; i < n; i++) {
          let max = 0;
          for (let j = i * step; j < (i + 1) * step && j < data.length; j += 16) max = Math.max(max, Math.abs(data[j]));
          out.push(max);
        }
        return out;
      })().catch(() => []));
    }
    let alive = true;
    peaksCache.get(src)!.then((p) => alive && setPeaks(p));
    return () => { alive = false; };
  }, [src]);
  return peaks;
}

const Waveform: React.FC<{ clip: Extract<Clip, { type: "audio" }>; fps: number; pxPerFrame: number }> = ({ clip, fps, pxPerFrame }) => {
  const peaks = usePeaks(clip.props.src);
  if (!peaks?.length) return null;
  const w = clip.duration * pxPerFrame;
  const startIdx = Math.floor(clip.props.trimStart * 50);
  const count = Math.ceil((clip.duration / fps) * 50);
  const bars = Math.min(count, Math.floor(w / 2));
  const pts = [];
  for (let i = 0; i < bars; i++) {
    const p = peaks[startIdx + Math.floor((i / bars) * count)] ?? 0;
    pts.push(<rect key={i} x={(i / bars) * w} y={(1 - p) * 14} width={1.2} height={Math.max(1, p * 28)} fill="rgba(255,255,255,.55)" />);
  }
  return <svg className="pointer-events-none absolute inset-x-0 top-1.5" width={w} height={30}>{pts}</svg>;
};

type Drag = { id: string; mode: "move" | "l" | "r"; x0: number; y0: number; start0: number; dur0: number; ti0: number; base: ProjectDoc } | null;

export function Timeline({ ed, onSeek, playing, onTogglePlay }: { ed: EditorApi; onSeek: (f: number) => void; playing: boolean; onTogglePlay: () => void }) {
  const { t } = useT();
  const { doc, frame, selected } = ed;
  const [zoom, setZoom] = useState(3); // px per frame
  const [drag, setDrag] = useState<Drag>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const tracksRef = useRef<HTMLDivElement>(null);
  const total = doc.durationInFrames;
  const width = total * zoom + 200;
  const fps = doc.fps;

  const snapPoints = () => {
    const pts = [0, frame, total, ...doc.scenes.flatMap((s) => [s.start, s.start + s.duration])];
    doc.tracks.forEach((tr) => tr.clips.forEach((c) => { if (c.id !== drag?.id) pts.push(c.start, c.start + c.duration); }));
    return pts;
  };
  const snap = (f: number) => {
    const th = 6 / zoom;
    let best = f;
    let bd = th;
    for (const p of snapPoints()) if (Math.abs(p - f) < bd) { bd = Math.abs(p - f); best = p; }
    return Math.round(best);
  };

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const df = (e.clientX - drag.x0) / zoom;
      const base = drag.base;
      ed.update((d) => {
        let ti = drag.ti0;
        let ci = -1;
        for (let i = 0; i < d.tracks.length; i++) { const k = d.tracks[i].clips.findIndex((c) => c.id === drag.id); if (k >= 0) { ti = i; ci = k; } }
        if (ci < 0) return;
        const c = d.tracks[ti].clips[ci];
        if (drag.mode === "move") {
          const ns = Math.max(0, snap(drag.start0 + df));
          const snappedEnd = snap(ns + drag.dur0);
          c.start = Math.abs(snappedEnd - (ns + drag.dur0)) < Math.abs(ns - (drag.start0 + df)) ? Math.max(0, snappedEnd - drag.dur0) : ns;
          // vertical: move to another track
          const rect = tracksRef.current?.getBoundingClientRect();
          if (rect) {
            const target = Math.floor((e.clientY - rect.top) / ROW);
            const vis = [...d.tracks].reverse();
            const tgt = vis[target];
            if (tgt && tgt !== d.tracks[ti] && !tgt.locked && (tgt.kind === "audio") === (c.type === "audio")) {
              d.tracks[ti].clips.splice(ci, 1);
              tgt.clips.push(c);
            }
          }
        } else if (drag.mode === "l") {
          const ns = Math.min(drag.start0 + drag.dur0 - 1, Math.max(0, snap(drag.start0 + df)));
          const delta = ns - drag.start0;
          c.start = ns;
          c.duration = drag.dur0 - delta;
          const bc = base.tracks.flatMap((x) => x.clips).find((x) => x.id === c.id);
          const p = c.props as unknown as Record<string, number>;
          if ((c.type === "video" || c.type === "audio") && bc) p.trimStart = Math.max(0, ((bc.props as unknown as Record<string, number>).trimStart ?? 0) + delta / fps);
        } else {
          c.duration = Math.max(1, snap(drag.start0 + drag.dur0 + df) - drag.start0);
        }
        d.durationInFrames = Math.max(d.durationInFrames, c.start + c.duration);
      }, { commit: false });
    };
    const up = () => {
      // single history entry for the whole drag
      ed.update(() => {}, { commit: true, base: drag.base });
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => window.removeEventListener("pointermove", move);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, zoom]);

  const startDrag = (e: React.PointerEvent, c: Clip, ti: number, mode: "move" | "l" | "r") => {
    e.stopPropagation();
    ed.setSelected(c.id);
    if (doc.tracks[ti].locked) return;
    setDrag({ id: c.id, mode, x0: e.clientX, y0: e.clientY, start0: c.start, dur0: c.duration, ti0: ti, base: doc });
  };

  const seekFromEvent = (clientX: number) => {
    const el = scroller.current;
    if (!el) return;
    const x = clientX - el.getBoundingClientRect().left + el.scrollLeft - HEAD;
    onSeek(Math.max(0, Math.min(total - 1, Math.round(x / zoom))));
  };
  const scrub = (e: React.PointerEvent) => {
    seekFromEvent(e.clientX);
    const move = (ev: PointerEvent) => seekFromEvent(ev.clientX);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", () => window.removeEventListener("pointermove", move), { once: true });
  };

  const ticksEvery = zoom > 6 ? fps / 2 : zoom > 2 ? fps : fps * 2;
  const ticks = [];
  for (let f = 0; f <= total; f += ticksEvery) ticks.push(f);
  const tc = (f: number) => `${Math.floor(f / fps / 60)}:${String(Math.floor(f / fps) % 60).padStart(2, "0")}.${String(f % fps).padStart(2, "0")}`;
  const sceneAt = doc.scenes.findIndex((s) => frame >= s.start && frame < s.start + s.duration);

  const addTrack = (kind: TrackKind) => ed.update((d) => {
    const tr = { id: uid("trk"), name: kind, kind, clips: [], hidden: false, locked: false, muted: false };
    if (kind === "audio") d.tracks.push(tr);
    else d.tracks.splice(d.tracks.findIndex((x) => x.kind === "audio") < 0 ? d.tracks.length : d.tracks.findIndex((x) => x.kind === "audio"), 0, tr);
  });
  const addScene = () => ed.update((d) => {
    const i = d.scenes.findIndex((s) => frame > s.start && frame < s.start + s.duration);
    if (i < 0) return;
    const s = d.scenes[i];
    const b = { id: uid("scn"), name: `${d.scenes.length + 1}. scene`, start: frame, duration: s.start + s.duration - frame };
    s.duration = frame - s.start;
    d.scenes.splice(i + 1, 0, b);
  });
  const removeScene = (i: number) => ed.update((d) => {
    if (d.scenes.length < 2) return;
    const [s] = d.scenes.splice(i, 1);
    const prev = d.scenes[Math.max(0, i - 1)];
    if (i === 0) { prev.start = 0; prev.duration += s.duration; } else prev.duration += s.duration;
  });

  return (
    <div className="flex h-full flex-col border-t border-line bg-panel text-xs">
      <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap border-b border-line px-2 py-1.5">
        <button className="btn-primary btn-xs w-16" onClick={onTogglePlay}>{playing ? "❚❚" : "▶"}</button>
        <span className="w-28 font-mono text-muted">{tc(frame)} / {tc(total)}</span>
        <button className="btn-ghost btn-xs" disabled={!selected} onClick={() => selected && ed.splitClip(selected, frame)} title="S">✂ {t.editor.split}</button>
        <button className="btn-ghost btn-xs" disabled={!selected} onClick={() => selected && ed.duplicateClip(selected)} title="Ctrl+D">⧉ {t.editor.duplicate}</button>
        <button className="btn-ghost btn-xs" disabled={!selected} onClick={() => selected && ed.deleteClip(selected)} title="Del">🗑 {t.editor.del}</button>
        <span className="mx-1 h-4 w-px bg-line" />
        <button className="btn-ghost btn-xs" onClick={addScene}>+ {t.editor.addScene}</button>
        <select className="input w-36 py-0.5 text-xs" value="" onChange={(e) => e.target.value && addTrack(e.target.value as TrackKind)}>
          <option value="">+ {t.editor.addTrack}</option>
          {(["video", "graphic", "text", "animation", "audio"] as TrackKind[]).map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <label className="ml-2 flex items-center gap-1 text-muted">⏱
          <input type="number" className="input w-20 py-0.5" value={(doc.durationInFrames / fps).toFixed(1)} step={0.5} min={1} onChange={(e) => { const v = Math.max(1, +e.target.value); ed.update((d) => { d.durationInFrames = Math.round(v * fps); const last = d.scenes[d.scenes.length - 1]; if (last) last.duration = Math.max(1, d.durationInFrames - last.start); }); }} />s
        </label>
        <div className="ml-auto flex items-center gap-1 text-muted">🔍<input type="range" min={0.5} max={14} step={0.5} value={zoom} onChange={(e) => setZoom(+e.target.value)} /></div>
      </div>
      <div ref={scroller} className="relative flex-1 overflow-auto">
        <div style={{ width: width + HEAD }} className="relative">
          {/* ruler */}
          <div className="sticky top-0 z-20 flex h-6 border-b border-line bg-panel2">
            <div className="sticky left-0 z-30 w-[150px] shrink-0 border-r border-line bg-panel2" />
            <div className="relative flex-1 cursor-pointer" onPointerDown={scrub}>
              {ticks.map((f) => <div key={f} className="absolute top-0 h-full border-l border-line pl-1 text-[10px] text-muted" style={{ left: f * zoom }}>{Math.round(f / fps * 10) / 10}s</div>)}
            </div>
          </div>
          {/* scenes */}
          <div className="flex h-6 border-b border-line">
            <div className="sticky left-0 z-10 flex w-[150px] shrink-0 items-center border-r border-line bg-panel px-2 text-muted">{t.editor.scenes}</div>
            <div className="relative flex-1">
              {doc.scenes.map((s, i) => (
                <div key={s.id} onClick={() => onSeek(s.start)} className={`group absolute top-0.5 flex h-5 items-center justify-between overflow-hidden rounded border px-1 ${i === sceneAt ? "border-accent2 bg-accent2/20" : "border-line bg-panel2"}`} style={{ left: s.start * zoom, width: Math.max(4, s.duration * zoom - 2) }}>
                  <input className="w-full bg-transparent outline-none" value={s.name} onClick={(e) => e.stopPropagation()} onChange={(e) => { const v = e.target.value; ed.update((d) => { d.scenes[i].name = v; }); }} />
                  {doc.scenes.length > 1 && <button className="hidden px-1 text-red-300 group-hover:block" onClick={(e) => { e.stopPropagation(); removeScene(i); }}>×</button>}
                </div>
              ))}
            </div>
          </div>
          {/* tracks (top = front-most layer) */}
          <div ref={tracksRef}>
            {[...doc.tracks].map((tr, ti) => ({ tr, ti })).reverse().map(({ tr, ti }) => (
              <div key={tr.id} className="flex border-b border-line/60" style={{ height: ROW }}>
                <div className="sticky left-0 z-10 flex w-[150px] shrink-0 items-center gap-1 border-r border-line bg-panel px-1.5">
                  <input className="min-w-0 flex-1 bg-transparent outline-none" value={tr.name} onChange={(e) => { const v = e.target.value; ed.update((d) => { d.tracks[ti].name = v; }); }} />
                  <button title="hide" className={tr.hidden ? "opacity-40" : ""} onClick={() => ed.update((d) => { d.tracks[ti].hidden = !d.tracks[ti].hidden; })}>👁</button>
                  {tr.kind === "audio" && <button title="mute" className={tr.muted ? "opacity-40" : ""} onClick={() => ed.update((d) => { d.tracks[ti].muted = !d.tracks[ti].muted; })}>🔊</button>}
                  <button title="lock" className={tr.locked ? "" : "opacity-40"} onClick={() => ed.update((d) => { d.tracks[ti].locked = !d.tracks[ti].locked; })}>🔒</button>
                  <button title="up" onClick={() => ed.update((d) => { if (ti < d.tracks.length - 1) [d.tracks[ti], d.tracks[ti + 1]] = [d.tracks[ti + 1], d.tracks[ti]]; })}>↑</button>
                  {tr.clips.length === 0 && <button title="remove" className="text-red-300" onClick={() => ed.update((d) => { d.tracks.splice(ti, 1); })}>×</button>}
                </div>
                <div className="relative flex-1" onPointerDown={(e) => { if (e.target === e.currentTarget) { ed.setSelected(null); scrub(e); } }}>
                  {tr.clips.map((c) => (
                    <div key={c.id} onPointerDown={(e) => startDrag(e, c, ti, "move")}
                      className={`absolute top-1 cursor-grab overflow-hidden rounded-md border text-[10px] text-white ${c.id === selected ? "border-white ring-1 ring-white" : "border-black/30"} ${tr.hidden ? "opacity-40" : ""}`}
                      style={{ left: c.start * zoom, width: Math.max(4, c.duration * zoom), height: ROW - 8, background: COLORS[c.type] ?? "#555" }}>
                      {c.type === "audio" && <Waveform clip={c} fps={fps} pxPerFrame={zoom} />}
                      <div className="relative truncate px-1.5 pt-0.5 font-medium">{c.name}</div>
                      {c.keyframes.map((k) => <span key={k.id} title={`${k.prop}=${Math.round(k.value)}`} className="absolute bottom-0.5 h-2 w-2 -translate-x-1 rotate-45 bg-yellow-300" style={{ left: k.frame * zoom }} />)}
                      {c.in.preset !== "none" && <span className="absolute bottom-0 left-0 h-1 bg-white/50" style={{ width: c.in.durationFrames * zoom }} />}
                      {c.out.preset !== "none" && <span className="absolute bottom-0 right-0 h-1 bg-white/50" style={{ width: c.out.durationFrames * zoom }} />}
                      <div className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize bg-white/0 hover:bg-white/40" onPointerDown={(e) => startDrag(e, c, ti, "l")} />
                      <div className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize bg-white/0 hover:bg-white/40" onPointerDown={(e) => startDrag(e, c, ti, "r")} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {/* playhead */}
          <div className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-red-500" style={{ left: HEAD + frame * zoom }}>
            <div className="absolute -left-1.5 top-0 h-3 w-3 rotate-45 bg-red-500" />
          </div>
          <div className="pointer-events-none absolute bottom-0 top-0 w-px bg-white/20" style={{ left: HEAD + total * zoom }} />
        </div>
      </div>
    </div>
  );
}
