"use client";
// Center panel: realtime Remotion preview + Fabric.js interaction layer for
// selecting, dragging, scaling and rotating layers, and inline text editing.
import React, { useEffect, useRef, useState } from "react";
import type { PlayerRef } from "@remotion/player";
import { Canvas as FabricCanvas, Rect } from "fabric";
import { AdPlayer } from "@/components/AdPlayer";
import { computeTransform } from "@/remotion/anim";
import type { Clip } from "@/remotion/types";
import { findClip, type EditorApi } from "./useEditor";

const FULLFRAME: Clip["type"][] = ["background", "transition", "audio"];

export function Stage({ ed, playerRef, playing }: { ed: EditorApi; playerRef: React.RefObject<PlayerRef | null>; playing: boolean }) {
  const { doc, frame, selected } = ed;
  const wrap = useRef<HTMLDivElement>(null);
  const canvasEl = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [editing, setEditing] = useState<string | null>(null);
  const edRef = useRef(ed);
  edRef.current = ed;

  // fit preview into available space
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const s = Math.min((r.width - 32) / doc.width, (r.height - 32) / doc.height);
      setBox({ w: Math.max(50, doc.width * s), h: Math.max(50, doc.height * s) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc.width, doc.height]);

  // create fabric canvas once
  useEffect(() => {
    if (!canvasEl.current) return;
    const c = new FabricCanvas(canvasEl.current, { selection: false, preserveObjectStacking: true, uniformScaling: false });
    fabricRef.current = c;
    c.on("selection:created", (e) => edRef.current.setSelected((e.selected?.[0] as unknown as { clipId: string })?.clipId ?? null));
    c.on("selection:updated", (e) => edRef.current.setSelected((e.selected?.[0] as unknown as { clipId: string })?.clipId ?? null));
    c.on("selection:cleared", () => edRef.current.setSelected(null));
    c.on("mouse:dblclick", (e) => {
      const id = (e.target as unknown as { clipId?: string })?.clipId;
      const f = id ? findClip(edRef.current.doc, id) : null;
      if (f && (f.clip.type === "text" || f.clip.type === "button")) setEditing(id!);
    });
    c.on("object:modified", (e) => {
      const obj = e.target as Rect & { clipId: string };
      const cur = edRef.current;
      const f = findClip(cur.doc, obj.clipId);
      if (!f) return;
      const k = c.getWidth() / cur.doc.width;
      const t = computeTransform(f.clip, cur.frame, cur.doc.fps);
      const s = t.scale || 1;
      const w = obj.getScaledWidth() / k / s;
      const h = obj.getScaledHeight() / k / s;
      const cx = (obj.left ?? 0) / k;
      const cy = (obj.top ?? 0) / k;
      const local = cur.frame - f.clip.start;
      cur.updateClip(obj.clipId, (clip) => {
        const setProp = (prop: "x" | "y" | "width" | "height" | "rotation", base: number, value: number) => {
          const kfs = clip.keyframes.filter((x) => x.prop === prop);
          if (kfs.length) {
            const at = kfs.find((x) => x.frame === local);
            if (at) at.value = value;
            else clip.keyframes.push({ id: `kf_${Math.random().toString(36).slice(2, 9)}`, frame: local, prop, value, easing: "power2.inOut" });
          } else (clip as unknown as Record<string, number>)[prop] = value;
          return base;
        };
        // compensate for animated offsets so the layer lands where it was dropped
        const dx = t.x - clip.x;
        const dy = t.y - clip.y;
        if (clip.type === "text") {
          const ratio = h / Math.max(1, t.height);
          if (Math.abs(ratio - 1) > 0.02 && Math.abs(w / Math.max(1, t.width) - ratio) < 0.15) clip.props.fontSize = Math.round(clip.props.fontSize * ratio);
        }
        setProp("width", clip.width, w);
        setProp("height", clip.height, h);
        setProp("x", clip.x, cx - w / 2 - (clip.keyframes.some((x) => x.prop === "x") ? 0 : dx));
        setProp("y", clip.y, cy - h / 2 - (clip.keyframes.some((x) => x.prop === "y") ? 0 : dy));
        setProp("rotation", clip.rotation, (obj.angle ?? 0) - (t.rotation - clip.rotation));
      });
    });
    return () => {
      c.dispose();
      fabricRef.current = null;
    };
  }, []);

  // sync fabric objects with the doc at the current frame
  useEffect(() => {
    const c = fabricRef.current;
    if (!c || !box.w) return;
    c.setDimensions({ width: box.w, height: box.h });
    const k = box.w / doc.width;
    c.discardActiveObject();
    c.clear();
    if (playing) {
      c.requestRenderAll();
      return;
    }
    let active: Rect | null = null;
    doc.tracks.forEach((track) => {
      if (track.hidden) return;
      track.clips.forEach((clip) => {
        if (FULLFRAME.includes(clip.type) || frame < clip.start || frame >= clip.start + clip.duration) return;
        const t = computeTransform(clip, frame, doc.fps);
        const r = new Rect({
          left: (t.x + t.width / 2) * k, top: (t.y + t.height / 2) * k, width: t.width * k, height: t.height * k,
          originX: "center", originY: "center", angle: t.rotation, scaleX: t.scale, scaleY: t.scale,
          fill: "rgba(0,0,0,0.001)", stroke: clip.id === selected ? "#7c5cff" : "rgba(255,255,255,0.0)", strokeWidth: 1, strokeUniform: true,
          cornerColor: "#7c5cff", cornerStrokeColor: "#fff", borderColor: "#7c5cff", transparentCorners: false, cornerSize: 9,
          selectable: !track.locked, hoverCursor: track.locked ? "default" : "move", lockMovementX: track.locked, lockMovementY: track.locked,
        });
        (r as unknown as { clipId: string }).clipId = clip.id;
        r.on("mouseover", () => { r.set("stroke", "rgba(124,92,255,0.7)"); c.requestRenderAll(); });
        r.on("mouseout", () => { r.set("stroke", clip.id === edRef.current.selected ? "#7c5cff" : "rgba(255,255,255,0)"); c.requestRenderAll(); });
        c.add(r);
        if (clip.id === selected) active = r;
      });
    });
    if (active) c.setActiveObject(active);
    c.requestRenderAll();
  }, [doc, frame, selected, box, playing]);

  const editingClip = editing ? findClip(doc, editing)?.clip : null;
  const k = box.w / doc.width;
  const et = editingClip ? computeTransform(editingClip, frame, doc.fps) : null;

  return (
    <div ref={wrap} className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[repeating-conic-gradient(#14171f_0%_25%,#0f1218_0%_50%)] bg-[length:24px_24px]">
      <div className="relative shadow-2xl shadow-black" style={{ width: box.w, height: box.h }}>
        <AdPlayer ref={playerRef} project={doc} controls={false} loop={false} hiddenClipIds={editing ? [editing] : undefined} style={{ width: box.w, height: box.h }} />
        <div className="absolute inset-0" style={{ pointerEvents: playing ? "none" : "auto" }}>
          <canvas ref={canvasEl} />
        </div>
        {editingClip && et && (
          <textarea
            autoFocus
            className="absolute z-10 resize-none border border-accent bg-black/60 p-1 text-white outline-none"
            style={{ left: et.x * k, top: et.y * k, width: et.width * k, height: et.height * k, fontSize: Math.max(10, ((editingClip.type === "text" ? editingClip.props.fontSize : (editingClip.props as { fontSize: number }).fontSize) ?? 40) * k), fontFamily: (editingClip.props as { fontFamily?: string }).fontFamily, textAlign: "center" }}
            defaultValue={editingClip.type === "text" ? editingClip.props.text : editingClip.type === "button" ? editingClip.props.label : ""}
            onBlur={(e) => {
              const v = e.target.value;
              ed.updateClip(editingClip.id, (c) => {
                if (c.type === "text") c.props.text = v;
                if (c.type === "button") c.props.label = v;
              });
              setEditing(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur();
              e.stopPropagation();
            }}
          />
        )}
      </div>
    </div>
  );
}
