/**
 * Next.js-opstarthook. Met RUN_WORKER_IN_WEB=true draait de job-worker in hetzelfde
 * proces als de webserver (eenvoudige installatie met één container). Voor productie met
 * meer verkeer: zet dit uit en start `npm run worker` als apart proces.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startInProcessWorker } = await import("./instrumentation-node");
    await startInProcessWorker();
  }
}
