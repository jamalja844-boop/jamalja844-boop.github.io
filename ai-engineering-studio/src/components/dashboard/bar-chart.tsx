"use client";

import { useState } from "react";
import { formatNumber, formatUsd } from "@/lib/utils";

/** Compacte staafgrafiek (SVG) voor kosten/tokens per dag. */
export function BarChart({ data }: { data: { day: string; cost: number; tokens: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [metric, setMetric] = useState<"cost" | "tokens">("tokens");
  const values = data.map((d) => (metric === "cost" ? d.cost : d.tokens));
  const max = Math.max(...values, metric === "cost" ? 0.01 : 10);
  const w = 560;
  const h = 160;
  const gap = 6;
  const bw = (w - gap * (data.length - 1)) / data.length;
  const active = hover !== null ? data[hover] : null;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {active
            ? `${new Date(active.day).toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" })}: ${formatNumber(active.tokens)} tokens · ${formatUsd(active.cost)}`
            : "Laatste 14 dagen"}
        </p>
        <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
          {(["tokens", "cost"] as const).map((m) => (
            <button key={m} onClick={() => setMetric(m)} className={`rounded-md px-2 py-1 font-medium ${metric === m ? "bg-accent text-foreground" : "text-muted-foreground"}`}>
              {m === "tokens" ? "Tokens" : "Kosten"}
            </button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h + 18}`} className="w-full" role="img" aria-label="Verbruik per dag">
        <defs>
          <linearGradient id="bar-g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2DD4BF" />
            <stop offset="1" stopColor="#6EBEEB" stopOpacity="0.55" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1="0" x2={w} y1={h - h * f} y2={h - h * f} stroke="currentColor" className="text-border" strokeDasharray="2 4" />
        ))}
        {data.map((d, i) => {
          const v = values[i];
          const bh = v > 0 ? Math.max(3, (v / max) * (h - 6)) : 2;
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={i * (bw + gap)} y={0} width={bw} height={h} fill="transparent" />
              <rect x={i * (bw + gap)} y={h - bh} width={bw} height={bh} rx={5} fill={v > 0 ? "url(#bar-g)" : "currentColor"} className={v > 0 ? "" : "text-border"} opacity={hover === null || hover === i ? 1 : 0.45} />
              {i % 2 === 0 && (
                <text x={i * (bw + gap) + bw / 2} y={h + 14} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                  {new Date(d.day).getDate()}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
