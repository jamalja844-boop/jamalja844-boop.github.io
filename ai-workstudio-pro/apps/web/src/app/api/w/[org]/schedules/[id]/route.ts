import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/security/audit";
import { saveSchedule, scheduleInputSchema } from "@/lib/cowork/scheduler";
import { nextRunAt, type Frequency } from "@/lib/cowork/schedule";

type P = { org: string; id: string };

const toggleSchema = z.object({ enabled: z.boolean() }).strict();

/** Volledig bijwerken, of alleen aan/uit zetten ({ enabled }). */
export const PATCH = orgHandler<P>({ permission: "cowork.use" }, async ({ req, ctx, params }) => {
  const id = z.string().uuid().parse(params.id);
  const body = await parseJson(req, z.unknown(), 100_000);
  const toggle = toggleSchema.safeParse(body);
  if (toggle.success) {
    await withTenant(ctx.tenant, async (tx) => {
      const [t] = await tx<{ frequency: Frequency; time_of_day: string; weekday: number | null; day_of_month: number | null; run_once_at: Date | null; timezone: string }[]>`
        select frequency, time_of_day, weekday, day_of_month, run_once_at, timezone from scheduled_tasks where id = ${id}`;
      if (!t) throw notFound("Geplande taak");
      const next = toggle.data.enabled
        ? nextRunAt({ frequency: t.frequency, timeOfDay: t.time_of_day, weekday: t.weekday, dayOfMonth: t.day_of_month, runOnceAt: t.run_once_at, timezone: t.timezone })
        : null;
      await tx`update scheduled_tasks set enabled = ${toggle.data.enabled && next !== null}, next_run_at = ${next} where id = ${id}`;
      await audit(tx, { action: toggle.data.enabled ? "schedule.enabled" : "schedule.disabled", targetType: "scheduled_task", targetId: id });
    });
    return { ok: true };
  }
  const input = scheduleInputSchema.parse(body);
  await saveSchedule(ctx.tenant, input, id);
  return { ok: true };
});

export const DELETE = orgHandler<P>({ permission: "cowork.use" }, async ({ ctx, params }) => {
  const id = z.string().uuid().parse(params.id);
  await withTenant(ctx.tenant, async (tx) => {
    const rows = await tx`delete from scheduled_tasks where id = ${id} returning id`;
    if (!rows.length) throw notFound("Geplande taak");
    await audit(tx, { action: "schedule.deleted", targetType: "scheduled_task", targetId: id });
  });
  return { ok: true };
});
