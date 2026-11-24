import { hostname } from "node:os";
import { json, withSystem, type Tx } from "@/lib/db";

export type JobType =
  | "document.ingest"
  | "agent.run"
  | "agent.resume"
  | "orchestration.plan"
  | "orchestration.advance"
  | "workflow.advance"
  | "retention.purge"
  | "code.run";

export interface JobRow {
  id: string;
  org_id: string | null;
  type: JobType;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  created_by: string | null;
}

/** Zet een job in de wachtrij binnen de huidige (tenant)transactie. */
export async function enqueue(tx: Tx, type: JobType, payload: Record<string, unknown>, opts: { runAt?: Date; maxAttempts?: number; priority?: number } = {}) {
  const [row] = await tx<{ id: string }[]>`
    insert into jobs (org_id, type, payload, run_at, max_attempts, priority, created_by)
    values (app_org_id(), ${type}, ${json(tx, payload)}, ${opts.runAt ?? new Date()}, ${opts.maxAttempts ?? 3}, ${opts.priority ?? 0}, app_user_id())
    returning id`;
  return row.id;
}

const WORKER_ID = `${hostname()}:${process.pid}`;

/** Claimt de volgende job (FOR UPDATE SKIP LOCKED); verlopen leases worden opnieuw opgepakt. */
export async function claimJob(leaseSeconds = 1800): Promise<JobRow | null> {
  const [job] = await withSystem((tx) => tx<JobRow[]>`
    update jobs set status = 'running', attempts = attempts + 1, locked_by = ${WORKER_ID},
                    locked_until = now() + make_interval(secs => ${leaseSeconds})
     where id = (
       select id from jobs
        where (status = 'queued' and run_at <= now())
           or (status = 'running' and locked_until < now())
        order by priority desc, run_at
        limit 1 for update skip locked)
    returning id, org_id, type, payload, attempts, max_attempts, created_by`);
  return job ?? null;
}

export async function completeJob(id: string, result: unknown) {
  await withSystem((tx) => tx`update jobs set status = 'succeeded', result = ${json(tx, result ?? null)}, finished_at = now(), locked_until = null where id = ${id}`);
}

export async function failJob(job: JobRow, error: string) {
  const dead = job.attempts >= job.max_attempts;
  const backoff = Math.min(300, 5 * 2 ** job.attempts);
  await withSystem((tx) => tx`
    update jobs set status = ${dead ? "dead" : "queued"}, last_error = ${error.slice(0, 2000)}, locked_until = null,
                    run_at = now() + make_interval(secs => ${backoff}), finished_at = ${dead ? new Date() : null}
     where id = ${job.id}`);
  return dead;
}
