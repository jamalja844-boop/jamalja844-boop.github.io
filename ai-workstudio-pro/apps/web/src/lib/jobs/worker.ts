import { claimJob, completeJob, failJob } from "@/lib/jobs/queue";
import { handleJob, purgeExpiredData } from "@/lib/jobs/handlers";

/**
 * Worker-loop voor de Postgres-jobqueue. Wordt gebruikt door `npm run worker` (apart proces)
 * en optioneel in-process door de webserver (RUN_WORKER_IN_WEB=true, handig voor één container).
 */
export function startWorker(opts: { concurrency: number; log?: (...a: unknown[]) => void; purge?: boolean }) {
  const log = opts.log ?? ((...a: unknown[]) => console.log(new Date().toISOString(), "[worker]", ...a));
  let stopping = false;
  let active = 0;

  async function loop(slot: number) {
    while (!stopping) {
      let job;
      try {
        job = await claimJob();
      } catch (e) {
        log(`slot ${slot}: kan geen job ophalen`, (e as Error).message);
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      if (!job) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      active++;
      const started = Date.now();
      try {
        const result = await handleJob(job);
        await completeJob(job.id, result);
        log(`✓ ${job.type} ${job.id} (${Date.now() - started} ms)`);
      } catch (e) {
        const dead = await failJob(job, (e as Error).stack ?? String(e));
        log(`✗ ${job.type} ${job.id}: ${(e as Error).message}${dead ? " (definitief)" : " (nieuwe poging volgt)"}`);
      } finally {
        active--;
      }
    }
  }

  // AVG-opschoning: bij start en daarna elk uur.
  const purge = async () => {
    try {
      const r = await purgeExpiredData();
      log("bewaartermijnen toegepast", r);
    } catch (e) {
      log("opschonen mislukt", (e as Error).message);
    }
  };
  let purgeTimer: NodeJS.Timeout | null = null;
  if (opts.purge !== false) {
    void purge();
    purgeTimer = setInterval(purge, 3600_000);
  }

  log(`gestart met ${opts.concurrency} parallelle slots`);
  const done = Promise.all(Array.from({ length: opts.concurrency }, (_, i) => loop(i + 1)));

  return {
    done,
    async stop(timeoutMs = 30_000) {
      if (stopping) return;
      stopping = true;
      if (purgeTimer) clearInterval(purgeTimer);
      log("stoppen… wachten op lopende jobs");
      const deadline = Date.now() + timeoutMs;
      while (active > 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 250));
    },
  };
}
