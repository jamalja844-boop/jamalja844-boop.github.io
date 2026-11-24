import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "turq" | "demo";

const toneClass: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  info: "bg-brand-sky/12 text-brand-sky-strong dark:text-brand-sky border-brand-sky/30",
  success: "bg-turq-400/12 text-turq-600 dark:text-turq-300 border-turq-400/30",
  warning: "bg-warning/12 text-warning border-warning/30",
  danger: "bg-danger/10 text-danger border-danger/30",
  turq: "bg-turq-400/15 text-turq-600 dark:text-turq-300 border-turq-400/40",
  demo: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300 border-fuchsia-400/40",
};

export function Badge({ tone = "neutral", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-4 whitespace-nowrap", toneClass[tone], className)}
      {...props}
    />
  );
}

export const STATUS_META: Record<string, { label: string; tone: Tone; pulse?: boolean }> = {
  idle: { label: "Beschikbaar", tone: "info" },
  working: { label: "Bezig", tone: "turq", pulse: true },
  running: { label: "Bezig", tone: "turq", pulse: true },
  planning: { label: "Plannen", tone: "turq", pulse: true },
  reporting: { label: "Rapporteren", tone: "turq", pulse: true },
  queued: { label: "In wachtrij", tone: "neutral" },
  blocked: { label: "Wacht op andere taak", tone: "neutral" },
  waiting_approval: { label: "Wacht op goedkeuring", tone: "warning", pulse: true },
  pending_approval: { label: "Wacht op goedkeuring", tone: "warning", pulse: true },
  pending: { label: "Open", tone: "warning" },
  approved: { label: "Goedgekeurd", tone: "success" },
  rejected: { label: "Afgewezen", tone: "danger" },
  succeeded: { label: "Geslaagd", tone: "success" },
  completed: { label: "Voltooid", tone: "success" },
  ready: { label: "Klaar", tone: "success" },
  processing: { label: "Verwerken", tone: "turq", pulse: true },
  uploaded: { label: "Geüpload", tone: "neutral" },
  failed: { label: "Mislukt", tone: "danger" },
  error: { label: "Fout", tone: "danger" },
  dead: { label: "Definitief mislukt", tone: "danger" },
  limit_reached: { label: "Limiet bereikt", tone: "warning" },
  cancelled: { label: "Geannuleerd", tone: "neutral" },
  expired: { label: "Verlopen", tone: "neutral" },
  disabled: { label: "Uitgeschakeld", tone: "neutral" },
  draft: { label: "Concept", tone: "neutral" },
  published: { label: "Gepubliceerd", tone: "success" },
  active: { label: "Actief", tone: "success" },
  archived: { label: "Gearchiveerd", tone: "neutral" },
  skipped: { label: "Overgeslagen", tone: "neutral" },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const meta = STATUS_META[status] ?? { label: status, tone: "neutral" as Tone };
  return (
    <Badge tone={meta.tone} className={className}>
      <span className={cn("size-1.5 rounded-full bg-current", meta.pulse && "animate-pulse-soft")} />
      {meta.label}
    </Badge>
  );
}

export function PageHeader({ title, description, eyebrow, actions }: { title: string; description?: React.ReactNode; eyebrow?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between animate-slide-up">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-turq-600 dark:text-turq-400">{eyebrow}</p>}
        <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-12 text-center">
      {icon && <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-accent text-brand-sky-strong dark:text-brand-sky [&_svg]:size-6">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, icon, accent }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon?: React.ReactNode; accent?: boolean }) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-border bg-card p-4", accent && "glow-ring")}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        {icon && <span className="text-brand-sky-strong dark:text-brand-sky [&_svg]:size-4">{icon}</span>}
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function Alert({ tone = "info", title, children, action }: { tone?: "info" | "warning" | "danger" | "success"; title?: string; children?: React.ReactNode; action?: React.ReactNode }) {
  const map = {
    info: "border-brand-sky/40 bg-brand-sky/8",
    warning: "border-warning/40 bg-warning/8",
    danger: "border-danger/40 bg-danger/8",
    success: "border-turq-400/40 bg-turq-400/8",
  };
  return (
    <div role="alert" className={cn("flex flex-col gap-2 rounded-xl border p-3.5 text-sm sm:flex-row sm:items-center sm:justify-between", map[tone])}>
      <div>
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-muted-foreground">{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">{children}</kbd>;
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent", className)} aria-label="Laden" />;
}

export function JsonView({ value, className }: { value: unknown; className?: string }) {
  return (
    <pre className={cn("max-h-80 overflow-auto rounded-xl border border-border bg-muted/60 p-3 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap break-words", className)}>
      {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
    </pre>
  );
}
