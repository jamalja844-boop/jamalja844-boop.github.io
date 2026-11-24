// Render queue. BullMQ on Redis when REDIS_URL is set; otherwise the worker polls the
// database for queued renders (durable, single-worker). Job state always lives in the DB,
// so failed/crashed renders can be retried from the Render Queue page.
import { config } from "./config";

export const QUEUE_NAME = "renders";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let queue: any = null;

export async function enqueueRender(renderId: string) {
  if (!config.redisUrl) return; // file/DB-polling mode: the worker picks it up
  if (!queue) {
    const { Queue } = await import("bullmq");
    const IORedis = (await import("ioredis")).default;
    queue = new Queue(QUEUE_NAME, { connection: new IORedis(config.redisUrl, { maxRetriesPerRequest: null }) });
  }
  await queue.add("render", { renderId }, { jobId: `${renderId}-${Date.now()}`, attempts: 1, removeOnComplete: 500, removeOnFail: 500 });
}

export const queueMode = () => (config.redisUrl ? "bullmq" : "db-poll");
