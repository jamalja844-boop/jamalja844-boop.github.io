"use client";
import React from "react";

export const PageHeader: React.FC<{ title: string; subtitle?: string; actions?: React.ReactNode }> = ({ title, subtitle, actions }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 className="text-2xl font-bold">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
    </div>
    {actions && <div className="flex gap-2">{actions}</div>}
  </div>
);

export const Field: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({ label, children, hint }) => (
  <div>
    <label className="label">{label}</label>
    {children}
    {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
  </div>
);

export const Badge: React.FC<{ tone?: "ok" | "warn" | "err" | "info" | "muted"; children: React.ReactNode }> = ({ tone = "muted", children }) => {
  const c = { ok: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", warn: "bg-amber-500/15 text-amber-300 border-amber-500/30", err: "bg-red-500/15 text-red-300 border-red-500/30", info: "bg-sky-500/15 text-sky-300 border-sky-500/30", muted: "bg-white/5 text-gray-300 border-line" }[tone];
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${c}`}>{children}</span>;
};

export const Progress: React.FC<{ value: number }> = ({ value }) => (
  <div className="h-2 w-full overflow-hidden rounded-full bg-line"><div className="h-full bg-gradient-to-r from-accent to-accent2 transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
);

export const ErrorBox: React.FC<{ error?: string | null }> = ({ error }) => (error ? <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</div> : null);

export const statusTone = (s: string) => (s === "done" || s === "succeeded" ? "ok" : s === "failed" ? "err" : s === "cancelled" || s === "skipped" ? "muted" : "info") as "ok" | "err" | "muted" | "info";
