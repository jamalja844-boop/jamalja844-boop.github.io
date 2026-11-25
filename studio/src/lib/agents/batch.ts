// Webshop batch: one generation job per product, executed one after another so a large
// shop does not overload the AI providers. Renders are queued as each product finishes.
import { db, type Row } from "../server/db";
import type { GenerateInput, JobData } from "../models";
import type { ShopProduct } from "../server/shop";
import { createGenerateJob, runPipeline } from "./pipeline";

export interface BatchOptions extends Omit<GenerateInput, "source" | "productData" | "url" | "prompt" | "assetIds" | "productId" | "styles"> {
  style: string; // "auto" or a style id
}

const AUTO_STYLES = ["ecommerce", "motion", "tiktok"] as const;
const running = new Set<string>();

export async function createShopBatch(owner: string, shop: { shopName: string; logo?: string; colors?: string[]; fonts?: string[] }, products: ShopProduct[], opts: BatchOptions) {
  const childJobIds: string[] = [];
  for (let i = 0; i < products.length; i++) {
    const style = opts.style === "auto" ? AUTO_STYLES[i % AUTO_STYLES.length] : opts.style;
    const input: GenerateInput = { ...opts, source: "data", productData: { ...products[i], shopName: shop.shopName, logo: shop.logo, colors: shop.colors, fonts: shop.fonts }, styles: [style as never] };
    const child = await createGenerateJob(owner, input, { start: false });
    childJobIds.push(child.id);
  }
  const batch = await db.insert<JobData>("jobs", owner, { type: "batch", status: "running", input: { shop, count: products.length, opts }, steps: [], heartbeat: new Date().toISOString(), result: { childJobIds } });
  void runBatch(owner, batch.id);
  return batch;
}

export async function runBatch(owner: string, batchId: string) {
  if (running.has(batchId)) return;
  running.add(batchId);
  try {
    for (;;) {
      const batch = await db.get<JobData>("jobs", batchId);
      if (!batch) return;
      const ids = batch.data.result?.childJobIds ?? [];
      let next: Row<JobData> | null = null;
      for (const id of ids) {
        const c = await db.get<JobData>("jobs", id);
        if (c && (c.data.status === "queued" || (c.data.status === "running" && Date.now() - new Date(c.data.heartbeat).getTime() > 10 * 60_000))) { next = c; break; }
      }
      if (!next) {
        await db.update("jobs", batch, { ...batch.data, status: "done", heartbeat: new Date().toISOString() });
        return;
      }
      await db.update("jobs", batch, { ...batch.data, heartbeat: new Date().toISOString() });
      await runPipeline(owner, next).catch(() => {});
    }
  } finally {
    running.delete(batchId);
  }
}

/** Restarts a batch whose server process stopped (e.g. after a restart). */
export function resumeIfStale(row: Row<JobData>) {
  if (row.data.type === "batch" && row.data.status === "running" && !running.has(row.id) && Date.now() - new Date(row.data.heartbeat).getTime() > 60_000) {
    void runBatch(row.owner_id, row.id);
  }
}
