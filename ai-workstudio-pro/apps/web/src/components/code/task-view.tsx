"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Ban, CheckCircle2, ChevronDown, ChevronRight, CircleAlert, Code2, FileEdit, FilePlus2, FileSearch, GitBranch, Hourglass, ListChecks,
  MessageSquareText, Search, ShieldAlert, Terminal,
} from "lucide-react";
import type { CodeTaskStepView } from "@workstudio/shared";
import { Button } from "@/components/ui/button";
import { Badge, Spinner } from "@/components/ui/misc";
import { DiffView } from "@/components/code/diff-view";
import { Markdown } from "@/components/chat/markdown";
import { api, ClientApiError } from "@/lib/client/api";
import { cn, formatNumber, formatUsd } from "@/lib/utils";

export interface CodeTaskData {
  task: {
    id: string;
    project_id: string;
    project_name: string;
    prompt: string;
    status: string;
    provider: string;
    model_id: string;
    plan: { understanding?: string; steps?: string[]; verification?: string } | null;
    summary: string | null;
    changed_files: string[];
    diff: string | null;
    error: string | null;
    iterations: number;
    max_steps: number;
    input_tokens: number;
    output_tokens: number;
    cost_usd: string;
    mine: boolean;
  };
  steps: CodeTaskStepView[];
  approval: { id: string; title: string; summary: string; status: string } | null;
}

const FINAL = ["succeeded", "failed", "cancelled", "limit_reached"];

export const TASK_STATUS: Record<string, { label: string; tone: "turq" | "success" | "danger" | "warning" | "neutral" }> = {
  queued: { label: "In wachtrij", tone: "neutral" },
  planning: { label: "Plan maken", tone: "turq" },
  running: { label: "Bezig", tone: "turq" },
  waiting_approval: { label: "Wacht op toestemming", tone: "warning" },
  succeeded: { label: "Afgerond", tone: "success" },
  failed: { label: "Mislukt", tone: "danger" },
  cancelled: { label: "Geannuleerd", tone: "neutral" },
  limit_reached: { label: "Limiet bereikt", tone: "warning" },
};

const STEP_ICON: Record<CodeTaskStepView["kind"], React.ComponentType<{ className?: string }>> = {
  plan: ListChecks, read: FileSearch, write: FilePlus2, edit: FileEdit, command: Terminal, git: GitBranch, search: Search,
  message: MessageSquareText, approval: ShieldAlert, error: CircleAlert, final: CheckCircle2,
};

/** Laadt een AI Code-taak en ververst elke 1,5 seconde zolang de taak loopt. */
export function useCodeTask(slug: string, taskId: string | null) {
  const [data, setData] = useState<CodeTaskData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!taskId) return;
    try {
      setData(await api.get<CodeTaskData>(`/api/w/${slug}/code/tasks/${taskId}`));
      setError(null);
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : "Taak laden mislukt");
    }
  }, [slug, taskId]);
  useEffect(() => {
    setData(null);
    load();
  }, [load]);
  const running = data ? !FINAL.includes(data.task.status) : Boolean(taskId);
  useEffect(() => {
    if (!running || !taskId) return;
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, [running, taskId, load]);
  return { data, error, reload: load, running };
}

function StepRow({ step }: { step: CodeTaskStepView }) {
  const [open, setOpen] = useState(step.kind === "plan" || step.kind === "final");
  const Icon = STEP_ICON[step.kind] ?? MessageSquareText;
  const d = step.data as { command?: string; exitCode?: number | null; stdout?: string; stderr?: string; durationMs?: number } | null;
  const expandable = Boolean(step.detail || (step.kind === "command" && d));
  return (
    <li className="relative pl-7" data-testid="code-step" data-kind={step.kind}>
      <span className={cn(
        "absolute left-0 top-1 grid size-5 place-items-center rounded-full border",
        step.status === "error" ? "border-danger/40 bg-danger/10 text-danger" : step.status === "waiting" ? "border-warning/40 bg-warning/10 text-warning" : "border-turq-400/40 bg-turq-400/10 text-turq-600 dark:text-turq-300",
      )}>
        <Icon className="size-3" />
      </span>
      <button type="button" disabled={!expandable} onClick={() => setOpen(!open)} className="flex w-full items-start gap-1.5 text-left text-[13px] disabled:cursor-default">
        {expandable && (open ? <ChevronDown className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />)}
        <span className={cn("min-w-0 break-words font-medium", step.kind === "command" && "font-mono text-[12px]")}>{step.title}</span>
        {d?.durationMs !== undefined && <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{(d.durationMs / 1000).toFixed(1)} s</span>}
      </button>
      {open && expandable && (
        <div className="mt-1.5 grid gap-2">
          {step.kind === "command" && d ? (
            <pre className="max-h-64 overflow-auto rounded-lg bg-navy-950 p-3 font-mono text-[11.5px] leading-relaxed text-slate-200">
              {(d.stdout ?? "").trim()}
              {d.stderr?.trim() ? <span className="text-rose-300">{`\n${d.stderr.trim()}`}</span> : null}
              {!d.stdout?.trim() && !d.stderr?.trim() ? "(geen uitvoer)" : null}
            </pre>
          ) : step.kind === "final" || step.kind === "plan" || step.kind === "message" ? (
            <div className="prose-chat rounded-lg bg-muted/50 p-3 text-[13px]"><Markdown text={step.detail} /></div>
          ) : (
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/60 p-3 font-mono text-[11.5px]">{step.detail}</pre>
          )}
        </div>
      )}
    </li>
  );
}

/** Volledige weergave van een AI Code-taak: plan, stappen, toestemming, diff en samenvatting. */
export function CodeTaskPanel({ slug, taskId, compact, onFinished }: { slug: string; taskId: string; compact?: boolean; onFinished?: () => void }) {
  const { data, error, reload, running } = useCodeTask(slug, taskId);
  const [busy, setBusy] = useState(false);
  const [showDiff, setShowDiff] = useState(!compact);
  const [notified, setNotified] = useState(false);

  useEffect(() => {
    if (data && FINAL.includes(data.task.status) && !notified) {
      setNotified(true);
      onFinished?.();
    }
  }, [data, notified, onFinished]);

  async function act(body: Record<string, unknown>, ok: string) {
    setBusy(true);
    try {
      await api.post(`/api/w/${slug}/code/tasks/${taskId}`, body);
      toast.success(ok);
      await reload();
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Actie mislukt");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!data) return <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground"><Spinner /> Taak laden…</div>;
  const { task, steps, approval } = data;
  const meta = TASK_STATUS[task.status] ?? { label: task.status, tone: "neutral" as const };
  const visibleSteps = compact ? steps.slice(-6) : steps;

  return (
    <div className="flex flex-col gap-4" data-testid="code-task" data-status={task.status}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={meta.tone} data-testid="code-task-status">{running && <Spinner className="size-3" />}{meta.label}</Badge>
        {task.provider === "demo" && <Badge tone="demo">DEMO-model</Badge>}
        <span className="text-xs text-muted-foreground">
          {task.iterations}/{task.max_steps} stappen · {formatNumber(task.input_tokens + task.output_tokens)} tokens · {formatUsd(task.cost_usd)}
        </span>
        <div className="ml-auto flex gap-2">
          {compact && (
            <Button asChild size="sm" variant="secondary"><Link href={`/w/${slug}/code/${task.project_id}?task=${task.id}`}><Code2 /> Openen in AI Code</Link></Button>
          )}
          {running && (task.mine) && (
            <Button size="sm" variant="danger" loading={busy} onClick={() => act({ action: "cancel" }, "Taak geannuleerd")}><Ban /> Annuleren</Button>
          )}
        </div>
      </div>

      {approval && (
        <div className="rounded-xl border border-warning/40 bg-warning/8 p-3" data-testid="code-approval">
          <p className="flex items-center gap-2 text-sm font-semibold"><ShieldAlert className="size-4 text-warning" /> {approval.title}</p>
          <code className="mt-2 block rounded-lg bg-navy-950 px-3 py-2 font-mono text-[12px] text-slate-100">{approval.summary}</code>
          <p className="mt-2 text-xs text-muted-foreground">Dit commando krijgt eenmalig netwerktoegang in de afgeschermde sandbox. Er wordt niets buiten het project geïnstalleerd.</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="accent" loading={busy} onClick={() => act({ action: "decide", approvalId: approval.id, decision: "approve" }, "Toestemming gegeven")}>Toestaan</Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => act({ action: "decide", approvalId: approval.id, decision: "reject" }, "Geweigerd")}>Weigeren</Button>
          </div>
        </div>
      )}

      {visibleSteps.length > 0 ? (
        <ol className="relative grid gap-3 before:absolute before:bottom-2 before:left-[9px] before:top-2 before:w-px before:bg-border">
          {compact && steps.length > visibleSteps.length && <li className="pl-7 text-xs text-muted-foreground">… {steps.length - visibleSteps.length} eerdere stappen</li>}
          {visibleSteps.map((s) => <StepRow key={s.id} step={s} />)}
          {running && !approval && <li className="flex items-center gap-2 pl-7 text-xs text-muted-foreground"><Hourglass className="size-3.5 animate-pulse" /> {task.status === "queued" ? "Wacht op de worker…" : "AI Code werkt…"}</li>}
        </ol>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> {task.status === "queued" ? "Taak staat in de wachtrij…" : "Bezig met plannen…"}</p>
      )}

      {task.error && task.status !== "cancelled" && <p className="rounded-xl border border-danger/30 bg-danger/8 p-3 text-sm text-danger">{task.error}</p>}

      {FINAL.includes(task.status) && (
        <div className="grid gap-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">Gewijzigde bestanden ({task.changed_files.length})</p>
            {task.diff && (
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setShowDiff(!showDiff)}>{showDiff ? "Diff verbergen" : "Diff tonen"}</Button>
            )}
          </div>
          {task.changed_files.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5" data-testid="changed-files">
              {task.changed_files.map((f) => <li key={f}><Badge tone="info" className="font-mono">{f}</Badge></li>)}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Geen bestanden gewijzigd.</p>
          )}
          {showDiff && task.diff && <DiffView diff={task.diff} />}
        </div>
      )}
    </div>
  );
}
