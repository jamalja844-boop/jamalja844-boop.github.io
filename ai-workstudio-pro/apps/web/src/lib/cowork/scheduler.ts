import { z } from "zod";
import { parseSlashCommand, type ChatArtifact } from "@workstudio/shared";
import { json, withSystem, withTenant, type TenantContext } from "@/lib/db";
import { ApiError } from "@/lib/api/errors";
import { loadOrgContext } from "@/lib/auth/context";
import { defaultChatModel, resolveModel } from "@/lib/ai/service";
import { audit } from "@/lib/security/audit";
import { runConversationTurn, type ChatEvent, type DbMessage } from "@/lib/chat/engine";
import { runChatCommand } from "@/lib/chat/commands";
import { saveDocument, writingContext } from "@/lib/writing/service";
import { isValidTimezone, nextRunAt, type ScheduleSpec } from "@/lib/cowork/schedule";

/** Opdrachten die niet ingepland mogen worden: ze hebben invloed buiten een concepttekst. */
const BLOCKED_COMMANDS = new Set(["code", "browser"]);

export const scheduleInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  prompt: z.string().trim().min(3).max(20_000),
  frequency: z.enum(["once", "daily", "weekdays", "weekly", "monthly"]),
  timeOfDay: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Gebruik UU:MM"),
  weekday: z.number().int().min(1).max(7).nullable().optional(),
  dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  runOnceAt: z.string().datetime({ offset: true }).nullable().optional(),
  timezone: z.string().max(64).default("Europe/Amsterdam"),
  provider: z.string().max(30).nullable().optional(),
  modelId: z.string().max(120).nullable().optional(),
  styleId: z.string().uuid().nullable().optional(),
  enabled: z.boolean().default(true),
});
export type ScheduleInput = z.infer<typeof scheduleInputSchema>;

function validatePrompt(prompt: string) {
  const cmd = parseSlashCommand(prompt);
  if (cmd && BLOCKED_COMMANDS.has(cmd.name)) {
    throw new ApiError(400, `/${cmd.name} kan niet worden ingepland. Geplande taken maken alleen concepten (teksten, documenten en Excel-bestanden).`);
  }
}

function specOf(i: ScheduleInput): ScheduleSpec {
  return {
    frequency: i.frequency, timeOfDay: i.timeOfDay, weekday: i.weekday ?? null, dayOfMonth: i.dayOfMonth ?? null,
    runOnceAt: i.runOnceAt ? new Date(i.runOnceAt) : null, timezone: i.timezone,
  };
}

export async function saveSchedule(ctx: TenantContext, input: ScheduleInput, id?: string) {
  validatePrompt(input.prompt);
  if (!isValidTimezone(input.timezone)) throw new ApiError(400, "Onbekende tijdzone");
  if (input.frequency === "weekly" && !input.weekday) throw new ApiError(400, "Kies een dag van de week");
  if (input.frequency === "monthly" && !input.dayOfMonth) throw new ApiError(400, "Kies een dag van de maand");
  if (input.frequency === "once" && !input.runOnceAt) throw new ApiError(400, "Kies datum en tijd");
  const next = nextRunAt(specOf(input));
  if (input.frequency === "once" && !next) throw new ApiError(400, "Het tijdstip ligt in het verleden");
  return withTenant(ctx, async (tx) => {
    if (input.provider && input.modelId) await resolveModel(tx, input.provider, input.modelId);
    if (id) {
      const [row] = await tx<{ id: string }[]>`
        update scheduled_tasks set name = ${input.name}, prompt = ${input.prompt}, frequency = ${input.frequency}, time_of_day = ${input.timeOfDay},
          weekday = ${input.weekday ?? null}, day_of_month = ${input.dayOfMonth ?? null}, run_once_at = ${input.runOnceAt ?? null},
          timezone = ${input.timezone}, provider = ${input.provider ?? null}, model_id = ${input.modelId ?? null}, style_id = ${input.styleId ?? null},
          enabled = ${input.enabled}, next_run_at = ${input.enabled ? next : null}
        where id = ${id} returning id`;
      if (!row) throw new ApiError(404, "Geplande taak niet gevonden");
      await audit(tx, { action: "schedule.updated", targetType: "scheduled_task", targetId: id });
      return id;
    }
    const [row] = await tx<{ id: string }[]>`
      insert into scheduled_tasks (org_id, user_id, name, prompt, frequency, time_of_day, weekday, day_of_month, run_once_at, timezone,
                                   provider, model_id, style_id, enabled, next_run_at)
      values (app_org_id(), app_user_id(), ${input.name}, ${input.prompt}, ${input.frequency}, ${input.timeOfDay}, ${input.weekday ?? null},
              ${input.dayOfMonth ?? null}, ${input.runOnceAt ?? null}, ${input.timezone}, ${input.provider ?? null}, ${input.modelId ?? null},
              ${input.styleId ?? null}, ${input.enabled}, ${input.enabled ? next : null})
      returning id`;
    await audit(tx, { action: "schedule.created", targetType: "scheduled_task", targetId: row.id, metadata: { frequency: input.frequency } });
    return row.id;
  });
}

/** Zet de taak direct in de wachtrij ("Nu uitvoeren"). */
export async function queueManualRun(ctx: TenantContext, taskId: string) {
  return withTenant(ctx, async (tx) => {
    const [t] = await tx<{ id: string }[]>`select id from scheduled_tasks where id = ${taskId}`;
    if (!t) throw new ApiError(404, "Geplande taak niet gevonden");
    const [open] = await tx`select id from scheduled_task_runs where task_id = ${taskId} and status in ('queued', 'running')`;
    if (open) throw new ApiError(409, "Deze taak wordt al uitgevoerd");
    const [run] = await tx<{ id: string }[]>`
      insert into scheduled_task_runs (org_id, task_id, user_id, trigger) values (app_org_id(), ${taskId}, app_user_id(), 'manual') returning id`;
    await tx`insert into jobs (org_id, type, payload, max_attempts, priority, created_by)
             values (app_org_id(), 'schedule.run', ${json(tx, { runId: run.id })}, 1, 3, app_user_id())`;
    return run.id;
  });
}

/**
 * Wordt periodiek door de worker aangeroepen: zet alle verlopen taken in de wachtrij en berekent
 * meteen het volgende tijdstip. Veilig met meerdere workers (FOR UPDATE SKIP LOCKED).
 */
export async function dispatchDueSchedules(now = new Date()) {
  return withSystem(async (tx) => {
    const due = await tx<{ id: string; org_id: string; user_id: string; frequency: ScheduleSpec["frequency"]; time_of_day: string; weekday: number | null; day_of_month: number | null; run_once_at: Date | null; timezone: string }[]>`
      select id, org_id, user_id, frequency, time_of_day, weekday, day_of_month, run_once_at, timezone
        from scheduled_tasks where enabled and next_run_at <= ${now} order by next_run_at limit 50 for update skip locked`;
    for (const t of due) {
      const [run] = await tx<{ id: string }[]>`
        insert into scheduled_task_runs (org_id, task_id, user_id, trigger) values (${t.org_id}, ${t.id}, ${t.user_id}, 'schedule') returning id`;
      await tx`insert into jobs (org_id, type, payload, max_attempts, priority, created_by)
               values (${t.org_id}, 'schedule.run', ${json(tx, { runId: run.id })}, 1, 3, ${t.user_id})`;
      const next = nextRunAt({ frequency: t.frequency, timeOfDay: t.time_of_day, weekday: t.weekday, dayOfMonth: t.day_of_month, runOnceAt: t.run_once_at, timezone: t.timezone }, now);
      await tx`update scheduled_tasks set next_run_at = ${next}, enabled = ${next !== null} where id = ${t.id}`;
    }
    return due.length;
  });
}

const KIND_BY_COMMAND: Record<string, "email" | "reply" | "translation" | "summary" | "analysis" | "document" | "report"> = {
  email: "email", reply: "reply", translate: "translation", summarize: "summary", analyze: "analysis", rewrite: "document", humanize: "document",
};

/** Voert een geplande run uit namens de eigenaar van de taak; het resultaat wordt een concept. */
export async function executeScheduledRun(ctx: TenantContext, runId: string) {
  const loaded = await withTenant(ctx, async (tx) => {
    const [run] = await tx<{ id: string; task_id: string; status: string }[]>`select id, task_id, status from scheduled_task_runs where id = ${runId}`;
    if (!run) return null;
    const [task] = await tx<{ id: string; name: string; prompt: string; provider: string | null; model_id: string | null; style_id: string | null }[]>`
      select id, name, prompt, provider, model_id, style_id from scheduled_tasks where id = ${run.task_id}`;
    return task ? { run, task } : null;
  });
  if (!loaded) return { skipped: "run of taak bestaat niet meer" };
  const { run, task } = loaded;
  if (run.status !== "queued") return { skipped: `run is al ${run.status}` };

  const fail = async (error: string) => {
    await withTenant(ctx, async (tx) => {
      await tx`update scheduled_task_runs set status = 'failed', error = ${error.slice(0, 1000)}, finished_at = now() where id = ${runId}`;
      await tx`update scheduled_tasks set last_run_at = now(), last_status = 'failed', run_count = run_count + 1 where id = ${task.id}`;
    });
    return { status: "failed", error };
  };

  try {
    validatePrompt(task.prompt);
    const who = await withSystem(async (tx) => {
      const [u] = await tx<{ email: string; name: string; avatar_color: string }[]>`select email, name, avatar_color from users where id = ${ctx.userId}`;
      const [o] = await tx<{ slug: string }[]>`select slug from organizations where id = ${ctx.orgId}`;
      return u && o ? { u, slug: o.slug } : null;
    });
    if (!who) return await fail("Gebruiker of organisatie bestaat niet meer");
    const oc = await loadOrgContext({ id: ctx.userId, email: who.u.email, name: who.u.name, avatarColor: who.u.avatar_color, isPlatformAdmin: false, sessionId: "scheduler" }, who.slug);
    if (!oc) return await fail("De eigenaar van deze taak is geen lid meer van de organisatie");
    if (!oc.can("cowork.use") || !oc.can("chat.use")) return await fail("De eigenaar heeft geen rechten meer voor geplande taken");

    const dateLabel = new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Amsterdam" }).format(new Date());
    const conversationId = await withTenant(ctx, async (tx) => {
      const model = task.provider && task.model_id ? { provider: task.provider, modelId: task.model_id } : await defaultChatModel(tx);
      if (!model) throw new ApiError(424, "Er is geen AI-model beschikbaar. Koppel een AI-provider onder Instellingen.");
      const [c] = await tx<{ id: string }[]>`
        insert into conversations (org_id, user_id, kind, title, provider, model_id, style_id)
        values (app_org_id(), app_user_id(), 'chat', ${`Gepland: ${task.name} · ${dateLabel}`.slice(0, 200)}, ${model.provider}, ${model.modelId}, ${task.style_id})
        returning id`;
      await tx`update scheduled_task_runs set status = 'running', started_at = now(), conversation_id = ${c.id} where id = ${runId}`;
      return c.id;
    });

    let last: DbMessage | null = null;
    let error: string | null = null;
    const emit = (e: ChatEvent) => {
      if (e.type === "assistant_message") last = e.message;
      if (e.type === "error") error = e.error;
    };
    const command = parseSlashCommand(task.prompt);
    if (command) {
      await runChatCommand({ ctx: oc, conversationId, raw: task.prompt, command, emit });
    } else {
      const { system } = await withTenant(ctx, (tx) => writingContext(tx, task.style_id));
      await runConversationTurn({ ctx, role: oc.role, conversationId, userContent: task.prompt, emit, extraSystem: `Je voert een geplande taak uit voor de gebruiker. Lever een direct bruikbaar resultaat.\n\n${system}` });
    }
    if (error) return await fail(error);
    const msg = last as DbMessage | null;
    if (!msg) return await fail("Geen antwoord ontvangen");

    const art = msg.metadata?.artifact as ChatArtifact | undefined;
    let documentId: string | null = null;
    let fileId: string | null = null;
    if (art?.type === "document") documentId = art.documentId;
    else if (art?.type === "file") fileId = art.fileId;
    else if (art?.type === "notice") return await fail(`${art.title}: ${art.missing.join("; ")}`);
    else {
      const content = art?.type === "email" ? `Onderwerp: ${art.subject}\n\n${art.body}` : msg.content;
      documentId = await saveDocument(ctx, {
        title: `${task.name} – ${dateLabel}`.slice(0, 200), kind: KIND_BY_COMMAND[command?.name ?? ""] ?? "report", content,
        metadata: { scheduledTaskId: task.id, runId }, conversationId, shared: false,
      });
    }
    const summary = msg.content.replace(/^\s*\[DEMO[^\]]*\]\s*/i, "").replace(/\s+/g, " ").trim().slice(0, 300);
    await withTenant(ctx, async (tx) => {
      await tx`update scheduled_task_runs set status = 'succeeded', document_id = ${documentId}, file_id = ${fileId}, summary = ${summary}, finished_at = now()
               where id = ${runId}`;
      await tx`update scheduled_tasks set last_run_at = now(), last_status = 'succeeded', run_count = run_count + 1 where id = ${task.id}`;
    });
    return { status: "succeeded", documentId, fileId };
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}
