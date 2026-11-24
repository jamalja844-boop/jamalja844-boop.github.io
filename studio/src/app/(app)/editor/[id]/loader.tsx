"use client";
import dynamic from "next/dynamic";
import type { ProjectDoc } from "@/remotion/types";

const EditorApp = dynamic(() => import("@/components/editor/EditorApp").then((m) => m.EditorApp), { ssr: false, loading: () => <div className="p-8 text-muted">Loading editor…</div> });

export function EditorLoader(props: { id: string; doc: ProjectDoc; updatedAt: string }) {
  return <EditorApp {...props} />;
}
