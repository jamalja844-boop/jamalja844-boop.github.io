/**
 * Job-worker: verwerkt documenten, agentruns, orchestraties en workflows.
 *   npm run worker            (productie: als apart proces/container draaien)
 * Meerdere workers kunnen parallel draaien (FOR UPDATE SKIP LOCKED).
 */
import { loadEnvFile } from "./load-env";

loadEnvFile();

async function main() {
  const { env } = await import("@/lib/env");
  const { claimJob, completeJob, failJob } = await import("@/lib/jobs/queue");
  const { handleJob, purgeExpiredData } = await import("@/lib/jobs/handlers");
  const { closeDb } = await import("@/lib/db");

  const concurrency = env().WORKER_CONCURRENCY;
  let stopping = false;
  let active = 0;
  const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[worker]", ...a);

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
  await purge();
  const purgeTimer = setInterval(purge, 3600_000);

  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(purgeTimer);
    log("stoppen… wachten op lopende jobs");
    const deadline = Date.now() + 30_000;
    while (active > 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 250));
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  log(`gestart met ${concurrency} parallelle slots`);
  await Promise.all(Array.from({ length: concurrency }, (_, i) => loop(i + 1)));
}

main().catch((e) => {
  console.error("[worker] fatale fout", e);
  process.exit(1);
});
