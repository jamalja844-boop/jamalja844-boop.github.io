/**
 * Job-worker: verwerkt documenten, agentruns, orchestraties, workflows en AI Code-taken.
 *   npm run worker            (productie: als apart proces/container draaien)
 * Meerdere workers kunnen parallel draaien (FOR UPDATE SKIP LOCKED).
 */
import { loadEnvFile } from "./load-env";

loadEnvFile();

async function main() {
  const { env } = await import("@/lib/env");
  const { startWorker } = await import("@/lib/jobs/worker");
  const { closeDb } = await import("@/lib/db");

  const worker = startWorker({ concurrency: env().WORKER_CONCURRENCY });
  const shutdown = async () => {
    await worker.stop();
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  await worker.done;
}

main().catch((e) => {
  console.error("[worker] fatale fout", e);
  process.exit(1);
});
