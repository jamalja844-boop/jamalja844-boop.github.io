"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { uid } from "@/remotion/defaults";
import type { Clip, ProjectDoc, Track } from "@/remotion/types";

export type SaveState = "saved" | "saving" | "dirty" | "error";

export function findClip(doc: ProjectDoc, id: string | null): { clip: Clip; track: Track; ti: number; ci: number } | null {
  if (!id) return null;
  for (let ti = 0; ti < doc.tracks.length; ti++) {
    const ci = doc.tracks[ti].clips.findIndex((c) => c.id === id);
    if (ci >= 0) return { clip: doc.tracks[ti].clips[ci], track: doc.tracks[ti], ti, ci };
  }
  return null;
}

export function useEditor(projectId: string, initial: ProjectDoc, initialUpdatedAt: string) {
  const [doc, setDoc] = useState<ProjectDoc>(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [frame, setFrame] = useState(0);
  const [save, setSave] = useState<SaveState>("saved");
  const [analysis, setAnalysis] = useState<unknown>(initial.meta?.analysis);
  const past = useRef<ProjectDoc[]>([]);
  const future = useRef<ProjectDoc[]>([]);
  const docRef = useRef(doc);
  const updatedAt = useRef(initialUpdatedAt);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  docRef.current = doc;

  const persist = useCallback(async () => {
    setSave("saving");
    try {
      const r = await api<{ updatedAt: string; analysis: unknown }>(`/api/projects/${projectId}`, { method: "PUT", json: { doc: docRef.current, baseUpdatedAt: updatedAt.current, autosave: true } });
      updatedAt.current = r.updatedAt;
      setAnalysis(r.analysis);
      setSave("saved");
    } catch {
      setSave("error");
    }
  }, [projectId]);

  const schedule = useCallback(() => {
    setSave("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(persist, 1200);
  }, [persist]);

  /** Apply a mutation. commit=false is used during drags (no history entry). */
  const update = useCallback((fn: (d: ProjectDoc) => void, opts: { commit?: boolean; base?: ProjectDoc } = {}) => {
    const commit = opts.commit ?? true;
    const next: ProjectDoc = structuredClone(docRef.current);
    fn(next);
    // keep composition length in sync with content
    if (commit) {
      past.current.push(opts.base ?? docRef.current);
      if (past.current.length > 150) past.current.shift();
      future.current = [];
    }
    docRef.current = next;
    setDoc(next);
    schedule();
  }, [schedule]);

  const replace = useCallback((d: ProjectDoc, commit = true) => {
    if (commit) {
      past.current.push(docRef.current);
      future.current = [];
    }
    docRef.current = d;
    setDoc(d);
    schedule();
  }, [schedule]);

  const undo = useCallback(() => {
    const p = past.current.pop();
    if (!p) return;
    future.current.push(docRef.current);
    docRef.current = p;
    setDoc(p);
    schedule();
  }, [schedule]);
  const redo = useCallback(() => {
    const f = future.current.pop();
    if (!f) return;
    past.current.push(docRef.current);
    docRef.current = f;
    setDoc(f);
    schedule();
  }, [schedule]);

  const updateClip = useCallback((id: string, fn: (c: Clip) => void, opts?: { commit?: boolean; base?: ProjectDoc }) => update((d) => {
    const f = findClip(d, id);
    if (f) fn(f.clip);
  }, opts), [update]);

  const addClip = useCallback((clip: Clip, preferredKind?: Track["kind"]) => {
    update((d) => {
      let track = d.tracks.find((t) => t.kind === (preferredKind ?? "graphic") && !t.locked);
      if (!track) {
        track = { id: uid("trk"), name: preferredKind ?? "graphic", kind: preferredKind ?? "graphic", clips: [], hidden: false, locked: false, muted: false };
        // audio tracks at the bottom, visual tracks above existing visual tracks
        if (track.kind === "audio") d.tracks.push(track);
        else {
          const firstAudio = d.tracks.findIndex((t) => t.kind === "audio" || t.kind === "caption");
          d.tracks.splice(firstAudio < 0 ? d.tracks.length : firstAudio, 0, track);
        }
      }
      track.clips.push(clip);
    });
    setSelected(clip.id);
  }, [update]);

  const deleteClip = useCallback((id: string) => {
    update((d) => {
      for (const t of d.tracks) t.clips = t.clips.filter((c) => c.id !== id);
    });
    setSelected(null);
  }, [update]);

  const duplicateClip = useCallback((id: string) => {
    const f = findClip(docRef.current, id);
    if (!f) return;
    const copy = { ...structuredClone(f.clip), id: uid("clip"), start: f.clip.start + f.clip.duration } as Clip;
    copy.keyframes = copy.keyframes.map((k) => ({ ...k, id: uid("kf") }));
    update((d) => {
      d.tracks[f.ti].clips.push(copy);
      d.durationInFrames = Math.max(d.durationInFrames, copy.start + copy.duration);
    });
    setSelected(copy.id);
  }, [update]);

  const splitClip = useCallback((id: string, at: number) => {
    const f = findClip(docRef.current, id);
    if (!f || at <= f.clip.start || at >= f.clip.start + f.clip.duration) return;
    const fps = docRef.current.fps;
    update((d) => {
      const t = d.tracks[f.ti];
      const a = t.clips[f.ci];
      const cut = at - a.start;
      const b = structuredClone(a) as Clip;
      b.id = uid("clip");
      b.start = at;
      b.duration = a.duration - cut;
      b.in = { ...b.in, preset: "none" };
      b.keyframes = a.keyframes.filter((k) => k.frame >= cut).map((k) => ({ ...k, id: uid("kf"), frame: k.frame - cut }));
      a.duration = cut;
      a.out = { ...a.out, preset: "none" };
      a.keyframes = a.keyframes.filter((k) => k.frame < cut);
      const bp = b.props as unknown as Record<string, unknown>;
      if (b.type === "video" || b.type === "audio") bp.trimStart = ((bp.trimStart as number) ?? 0) + cut / fps;
      if (b.type === "caption") (bp.words as { start: number }[]) = (bp.words as { start: number; end: number; text: string }[]).filter((w) => w.start >= at);
      t.clips.splice(f.ci + 1, 0, b);
    });
  }, [update]);

  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (save !== "saved") e.preventDefault();
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [save]);

  return { doc, update, replace, updateClip, addClip, deleteClip, duplicateClip, splitClip, undo, redo, selected, setSelected, frame, setFrame, save, persist, analysis, updatedAt, canUndo: past.current.length > 0, canRedo: future.current.length > 0 };
}

export type EditorApi = ReturnType<typeof useEditor>;
