"use client";
// Right panel: position/scale/rotation/opacity, type-specific properties, colors, fonts,
// in/out/loop animations with easing curves, keyframes, shadow and blend mode.
import React, { useState } from "react";
import { ease } from "@/remotion/anim";
import { uid } from "@/remotion/defaults";
import { EASINGS, IN_PRESETS, KEYFRAME_PROPS, LOOP_PRESETS, type Clip, type EasingName, type KeyframeProp } from "@/remotion/types";
import { useT } from "@/lib/i18n/context";
import { findClip, type EditorApi } from "./useEditor";

const FONTS = ["Inter", "Poppins", "Montserrat", "Playfair Display", "Bebas Neue", "DM Sans", "Space Grotesk", "Nunito", "Lato", "Oswald", "Raleway", "Roboto", "Archivo Black", "Anton", "Cairo", "Tajawal", "Lora", "Merriweather"];

const ENUMS: Record<string, string[]> = {
  align: ["left", "center", "right"], fit: ["cover", "contain"], shape: ["rect", "circle", "blob", "line", "ring"], icon: ["arrow", "cart", "none"],
  style: ["tag", "burst", "pill", "minimal"], kind: [], reveal: ["draw", "scale", "glow"], direction: ["left", "right", "up", "down"], role: ["music", "voiceover", "sfx"], timing: ["exact", "estimated"],
};
const KIND_ENUMS: Record<string, string[]> = {
  particles: ["dots", "sparkles", "confetti", "bokeh", "snow", "lines"],
  background: ["solid", "linear", "radial", "mesh", "grid", "noise", "spotlight", "stripes"],
  illustration: ["check", "star", "heart", "bolt", "arrow", "sparkle", "cart", "truck", "shield", "clock"],
  transition: ["wipe", "circle", "flash", "slide", "zoomBlur", "bars"],
};
const HIDDEN = new Set(["assetId", "words"]);

export const EaseCurve: React.FC<{ name: EasingName }> = ({ name }) => {
  const f = ease(name);
  const pts = Array.from({ length: 41 }, (_, i) => `${(i / 40) * 100},${60 - f(i / 40) * 50 + 5}`).join(" ");
  return <svg viewBox="-2 -10 104 80" className="h-14 w-full rounded bg-bg"><line x1="0" y1="55" x2="100" y2="55" stroke="#252a36" /><line x1="0" y1="5" x2="100" y2="5" stroke="#252a36" /><polyline points={pts} fill="none" stroke="#22d3ee" strokeWidth="2" /></svg>;
};

const Num: React.FC<{ label: string; value: number; onChange: (v: number) => void; step?: number }> = ({ label, value, onChange, step = 1 }) => (
  <label className="block"><span className="text-[10px] uppercase text-muted">{label}</span><input type="number" className="input py-1 text-xs" step={step} value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0} onChange={(e) => onChange(+e.target.value)} /></label>
);

const Section: React.FC<{ title: string; children: React.ReactNode; open?: boolean }> = ({ title, children, open = true }) => {
  const [o, setO] = useState(open);
  return (
    <div className="border-b border-line">
      <button className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted" onClick={() => setO(!o)}>{title}<span>{o ? "−" : "+"}</span></button>
      {o && <div className="space-y-2 px-3 pb-3">{children}</div>}
    </div>
  );
};

export function Inspector({ ed }: { ed: EditorApi }) {
  const { t } = useT();
  const f = findClip(ed.doc, ed.selected);
  if (!f) {
    return (
      <div className="p-4 text-sm text-muted">
        <p>{t.editor.noSelection}</p>
        <div className="mt-4 space-y-2 text-xs">
          <label className="block"><span className="label">Project</span><input className="input" value={ed.doc.name} onChange={(e) => { const v = e.target.value; ed.update((d) => { d.name = v; }); }} /></label>
          <label className="block"><span className="label">Background</span><input type="color" className="h-8 w-full" value={ed.doc.backgroundColor} onChange={(e) => { const v = e.target.value; ed.update((d) => { d.backgroundColor = v; }); }} /></label>
          <p>{ed.doc.width}×{ed.doc.height} · {ed.doc.fps} fps · {ed.doc.aspect}</p>
        </div>
      </div>
    );
  }
  const c = f.clip;
  const set = (fn: (c: Clip) => void) => ed.updateClip(c.id, fn);
  const props = c.props as unknown as Record<string, unknown>;
  const setProp = (k: string, v: unknown) => set((x) => { (x.props as unknown as Record<string, unknown>)[k] = v; if (k === "fontFamily" && typeof v === "string") ed.update((d) => { if (!d.fonts.includes(v)) d.fonts.push(v); }, { commit: false }); });
  const local = ed.frame - c.start;

  return (
    <div className="text-xs">
      <div className="flex items-center gap-2 border-b border-line p-3">
        <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] uppercase">{c.type}</span>
        <input className="input py-1 text-xs" value={c.name} onChange={(e) => { const v = e.target.value; set((x) => { x.name = v; }); }} />
      </div>
      <Section title={t.editor.position}>
        <div className="grid grid-cols-2 gap-2">
          <Num label="Start (f)" value={c.start} onChange={(v) => set((x) => { x.start = Math.max(0, Math.round(v)); })} />
          <Num label="Dur (f)" value={c.duration} onChange={(v) => set((x) => { x.duration = Math.max(1, Math.round(v)); })} />
          {c.type !== "audio" && <>
            <Num label="X" value={c.x} onChange={(v) => set((x) => { x.x = v; })} />
            <Num label="Y" value={c.y} onChange={(v) => set((x) => { x.y = v; })} />
            <Num label="W" value={c.width} onChange={(v) => set((x) => { x.width = Math.max(1, v); })} />
            <Num label="H" value={c.height} onChange={(v) => set((x) => { x.height = Math.max(1, v); })} />
          </>}
        </div>
        {c.type !== "audio" && (
          <div className="flex gap-1">
            {[["⇤", (x: Clip) => { x.x = 0; }], ["↔", (x: Clip) => { x.x = (ed.doc.width - x.width) / 2; }], ["⇥", (x: Clip) => { x.x = ed.doc.width - x.width; }], ["⤒", (x: Clip) => { x.y = 0; }], ["↕", (x: Clip) => { x.y = (ed.doc.height - x.height) / 2; }], ["⤓", (x: Clip) => { x.y = ed.doc.height - x.height; }]].map(([l, fn]) => (
              <button key={l as string} className="btn-ghost btn-xs flex-1" onClick={() => set(fn as (x: Clip) => void)}>{l as string}</button>
            ))}
          </div>
        )}
      </Section>
      {c.type !== "audio" && (
        <Section title={t.editor.transform}>
          <div className="grid grid-cols-3 gap-2">
            <Num label="Rotation°" value={c.rotation} onChange={(v) => set((x) => { x.rotation = v; })} />
            <Num label="Scale" step={0.05} value={c.scale} onChange={(v) => set((x) => { x.scale = v; })} />
            <Num label="Opacity" step={0.05} value={c.opacity} onChange={(v) => set((x) => { x.opacity = Math.max(0, Math.min(1, v)); })} />
          </div>
          <label className="block"><span className="text-[10px] uppercase text-muted">Blend</span>
            <select className="input py-1 text-xs" value={c.blendMode ?? ""} onChange={(e) => set((x) => { x.blendMode = e.target.value || undefined; })}>
              {["", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "difference"].map((b) => <option key={b} value={b}>{b || "normal"}</option>)}
            </select>
          </label>
        </Section>
      )}
      <Section title={t.editor.properties}>
        {Object.entries(props).filter(([k]) => !HIDDEN.has(k)).map(([k, v]) => {
          const opts = k === "kind" ? KIND_ENUMS[c.type] : ENUMS[k];
          if (k === "fontFamily") return (
            <label key={k} className="block"><span className="text-[10px] uppercase text-muted">Font</span>
              <input list="fonts" className="input py-1 text-xs" value={String(v)} onChange={(e) => /^[A-Za-z0-9 ]{0,40}$/.test(e.target.value) && setProp(k, e.target.value)} />
              <datalist id="fonts">{FONTS.map((x) => <option key={x} value={x} />)}</datalist>
            </label>
          );
          if (opts?.length) return <label key={k} className="block"><span className="text-[10px] uppercase text-muted">{k}</span><select className="input py-1 text-xs" value={String(v)} onChange={(e) => setProp(k, e.target.value)}>{opts.map((o) => <option key={o}>{o}</option>)}</select></label>;
          if (typeof v === "boolean") return <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={v} onChange={(e) => setProp(k, e.target.checked)} />{k}</label>;
          if (typeof v === "number") return <Num key={k} label={k} step={k.match(/volume|opacity|speed|tilt|rotationSpeed/) ? 0.05 : 1} value={v} onChange={(n) => setProp(k, n)} />;
          if (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v)) return <label key={k} className="flex items-center justify-between gap-2"><span className="text-[10px] uppercase text-muted">{k}</span><span className="flex items-center gap-1"><input type="color" value={v} onChange={(e) => setProp(k, e.target.value)} /><input className="input w-20 py-0.5 text-[10px]" value={v} onChange={(e) => setProp(k, e.target.value)} /></span></label>;
          if (k === "text") return <label key={k} className="block"><span className="text-[10px] uppercase text-muted">Text (**word** = highlight)</span><textarea className="input h-20 text-xs" value={String(v)} onChange={(e) => setProp(k, e.target.value)} /></label>;
          if (k === "src") return <div key={k} className="truncate text-[10px] text-muted">src: {String(v) || "—"}</div>;
          if (typeof v === "string" || v === undefined) return <label key={k} className="block"><span className="text-[10px] uppercase text-muted">{k}</span><input className="input py-1 text-xs" value={(v as string) ?? ""} onChange={(e) => setProp(k, e.target.value)} /></label>;
          return null;
        })}
        {c.type === "caption" && <p className="text-[10px] text-muted">{c.props.words.length} words · timing: {c.props.timing}</p>}
      </Section>
      {c.type !== "audio" && (
        <Section title={t.editor.animation}>
          {(["in", "out"] as const).map((which) => {
            const a = c[which];
            return (
              <div key={which} className="space-y-1 rounded border border-line p-2">
                <div className="font-semibold">{which === "in" ? t.editor.inAnim : t.editor.outAnim}</div>
                <div className="grid grid-cols-2 gap-1">
                  <select className="input py-1 text-xs" value={a.preset} onChange={(e) => set((x) => { x[which] = { ...x[which], preset: e.target.value as never, durationFrames: x[which].durationFrames || 15 }; })}>{IN_PRESETS.map((p) => <option key={p}>{p}</option>)}</select>
                  <input type="number" className="input py-1 text-xs" value={a.durationFrames} min={0} onChange={(e) => set((x) => { x[which] = { ...x[which], durationFrames: Math.max(0, +e.target.value) }; })} />
                  <select className="input py-1 text-xs" value={a.easing} onChange={(e) => set((x) => { x[which] = { ...x[which], easing: e.target.value as EasingName }; })}>{EASINGS.map((p) => <option key={p}>{p}</option>)}</select>
                  <label className="flex items-center gap-1"><input type="checkbox" checked={!!a.spring} onChange={(e) => set((x) => { x[which] = { ...x[which], spring: e.target.checked }; })} />{t.editor.spring}</label>
                </div>
                {!a.spring && <EaseCurve name={a.easing} />}
              </div>
            );
          })}
          <div className="grid grid-cols-2 gap-1">
            <label><span className="text-[10px] uppercase text-muted">{t.editor.loop}</span><select className="input py-1 text-xs" value={c.loop} onChange={(e) => set((x) => { x.loop = e.target.value as never; })}>{LOOP_PRESETS.map((p) => <option key={p}>{p}</option>)}</select></label>
            <Num label="Intensity" step={0.1} value={c.loopIntensity} onChange={(v) => set((x) => { x.loopIntensity = v; })} />
          </div>
        </Section>
      )}
      {c.type !== "audio" && (
        <Section title={t.editor.keyframes}>
          <KeyframeAdder onAdd={(prop) => set((x) => {
            const base = (x as unknown as Record<string, number>)[prop];
            const existing = x.keyframes.find((k) => k.prop === prop && k.frame === local);
            if (existing) return;
            if (!x.keyframes.some((k) => k.prop === prop) && local > 0) x.keyframes.push({ id: uid("kf"), frame: 0, prop, value: base, easing: "linear" });
            x.keyframes.push({ id: uid("kf"), frame: Math.max(0, Math.min(x.duration - 1, local)), prop, value: base, easing: "power2.inOut" });
          })} disabled={local < 0 || local >= c.duration} label={t.editor.addKeyframe} />
          {c.keyframes.slice().sort((a, b) => a.prop.localeCompare(b.prop) || a.frame - b.frame).map((k) => (
            <div key={k.id} className="grid grid-cols-[50px_52px_1fr_1fr_20px] items-center gap-1">
              <span className="text-[10px] text-yellow-300">{k.prop}</span>
              <input type="number" className="input px-1 py-0.5 text-[10px]" value={k.frame} onChange={(e) => set((x) => { const kk = x.keyframes.find((y) => y.id === k.id)!; kk.frame = Math.max(0, Math.min(x.duration - 1, Math.round(+e.target.value))); })} title="frame" />
              <input type="number" className="input px-1 py-0.5 text-[10px]" step={k.prop === "scale" || k.prop === "opacity" ? 0.05 : 1} value={Math.round(k.value * 100) / 100} onChange={(e) => set((x) => { x.keyframes.find((y) => y.id === k.id)!.value = +e.target.value; })} />
              <select className="input px-1 py-0.5 text-[10px]" value={k.easing} onChange={(e) => set((x) => { x.keyframes.find((y) => y.id === k.id)!.easing = e.target.value as EasingName; })}>{EASINGS.map((p) => <option key={p}>{p}</option>)}</select>
              <button className="text-red-300" onClick={() => set((x) => { x.keyframes = x.keyframes.filter((y) => y.id !== k.id); })}>×</button>
            </div>
          ))}
        </Section>
      )}
      {c.type !== "audio" && (
        <Section title={t.editor.shadow} open={false}>
          <label className="flex items-center gap-2"><input type="checkbox" checked={c.shadow.enabled} onChange={(e) => set((x) => { x.shadow.enabled = e.target.checked; })} />{t.editor.shadow}</label>
          <div className="grid grid-cols-3 gap-1">
            <Num label="Blur" value={c.shadow.blur} onChange={(v) => set((x) => { x.shadow.blur = v; })} />
            <Num label="X" value={c.shadow.x} onChange={(v) => set((x) => { x.shadow.x = v; })} />
            <Num label="Y" value={c.shadow.y} onChange={(v) => set((x) => { x.shadow.y = v; })} />
          </div>
          <input className="input py-1 text-xs" value={c.shadow.color} onChange={(e) => set((x) => { x.shadow.color = e.target.value; })} />
        </Section>
      )}
    </div>
  );
}

const KeyframeAdder: React.FC<{ onAdd: (p: KeyframeProp) => void; disabled: boolean; label: string }> = ({ onAdd, disabled, label }) => {
  const [p, setP] = useState<KeyframeProp>("y");
  return (
    <div className="flex gap-1">
      <select className="input py-1 text-xs" value={p} onChange={(e) => setP(e.target.value as KeyframeProp)}>{KEYFRAME_PROPS.map((k) => <option key={k}>{k}</option>)}</select>
      <button className="btn-ghost btn-xs shrink-0" disabled={disabled} onClick={() => onAdd(p)}>◆ {label}</button>
    </div>
  );
};
