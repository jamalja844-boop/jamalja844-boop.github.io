/** Alleen Node.js-runtime: start de job-worker in het webproces als RUN_WORKER_IN_WEB=true. */
export async function startInProcessWorker() {
  if (process.env.RUN_WORKER_IN_WEB !== "true") return;
  const g = globalThis as unknown as { __workstudioWorker?: boolean };
  if (g.__workstudioWorker) return;
  g.__workstudioWorker = true;
  const { startWorker } = await import("./lib/jobs/worker");
  const { env } = await import("./lib/env");
  startWorker({ concurrency: Math.max(1, Math.min(env().WORKER_CONCURRENCY, 4)), log: (...a) => console.log("[worker:web]", ...a) });
}
