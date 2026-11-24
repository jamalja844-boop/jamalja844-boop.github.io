"use client";

import { cn } from "@/lib/utils";

/** Gekleurde unified diff (toevoegingen groen, verwijderingen rood, bestandskoppen gemarkeerd). */
export function DiffView({ diff, className }: { diff: string; className?: string }) {
  if (!diff.trim()) return <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">Geen wijzigingen ten opzichte van de laatste commit.</p>;
  const lines = diff.split("\n");
  return (
    <pre data-testid="diff-view" className={cn("max-h-[480px] overflow-auto rounded-xl border border-border bg-navy-950 p-0 font-mono text-[12px] leading-[1.55] text-slate-200", className)}>
      {lines.map((l, i) => {
        const cls = l.startsWith("diff --git")
          ? "mt-2 border-t border-white/10 bg-white/5 px-3 pt-2 font-semibold text-brand-sky first:mt-0 first:border-0"
          : l.startsWith("+++") || l.startsWith("---")
            ? "px-3 text-slate-400"
            : l.startsWith("@@")
              ? "px-3 text-fuchsia-300/90"
              : l.startsWith("+")
                ? "bg-emerald-500/12 px-3 text-emerald-300"
                : l.startsWith("-")
                  ? "bg-rose-500/12 px-3 text-rose-300"
                  : "px-3";
        return <div key={i} className={cls}>{l || " "}</div>;
      })}
    </pre>
  );
}
