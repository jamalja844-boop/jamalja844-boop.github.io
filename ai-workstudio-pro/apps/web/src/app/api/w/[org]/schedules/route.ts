import { orgHandler, parseJson } from "@/lib/api/handler";
import { withTenant } from "@/lib/db";
import { saveSchedule, scheduleInputSchema } from "@/lib/cowork/scheduler";

export const GET = orgHandler({ permission: "cowork.use" }, async ({ ctx }) => {
  return withTenant(ctx.tenant, async (tx) => ({
    schedules: await tx`
      select id, name, prompt, frequency, time_of_day, weekday, day_of_month, run_once_at, timezone, provider, model_id, style_id,
             enabled, next_run_at, last_run_at, last_status, run_count, created_at
        from scheduled_tasks order by enabled desc, next_run_at nulls last, created_at desc`,
    runs: await tx`
      select r.id, r.task_id, r.trigger, r.status, r.conversation_id, r.document_id, r.file_id, r.summary, r.error, r.created_at, r.finished_at,
             d.title as document_title, f.filename
        from scheduled_task_runs r left join writing_documents d on d.id = r.document_id left join cowork_files f on f.id = r.file_id
       order by r.created_at desc limit 100`,
  }));
});

export const POST = orgHandler({ permission: "cowork.use", rate: { name: "schedule-create", limit: 30, windowSec: 600 } }, async ({ req, ctx }) => {
  const input = await parseJson(req, scheduleInputSchema);
  const id = await saveSchedule(ctx.tenant, input);
  return { id };
});
