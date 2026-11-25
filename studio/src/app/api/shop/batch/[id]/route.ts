import { db } from "@/lib/server/db";
import { HttpError, requireUser } from "@/lib/server/auth";
import { handler } from "@/lib/server/http";
import { resumeIfStale } from "@/lib/agents/batch";
import type { GenerateInput, JobData, ProjectData, RenderData } from "@/lib/models";

export const GET = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const u = await requireUser();
  const batch = await db.getOwned<JobData>("jobs", (await params).id, u.id);
  if (!batch || batch.data.type !== "batch") throw new HttpError(404, "Not found");
  resumeIfStale(batch);
  const items = [];
  for (const cid of batch.data.result?.childJobIds ?? []) {
    const c = await db.getOwned<JobData>("jobs", cid, u.id);
    if (!c) continue;
    const input = c.data.input as GenerateInput;
    const renders = [];
    for (const rid of c.data.result?.renderIds ?? []) {
      const r = await db.getOwned<RenderData>("renders", rid, u.id);
      if (r) renders.push({ id: r.id, status: r.data.status, progress: r.data.progress, outputAssetId: r.data.outputAssetId, aspect: r.data.doc.aspect, projectId: r.data.projectId, error: r.data.error });
    }
    const projects = [];
    for (const pid of c.data.result?.projectIds ?? []) {
      const p = await db.getOwned<ProjectData>("projects", pid, u.id);
      if (p) projects.push({ id: p.id, aspect: p.data.doc.aspect, name: p.data.doc.name, score: (p.data.doc.meta?.analysis as { score?: number } | undefined)?.score });
    }
    const runningStep = c.data.steps.find((s) => s.status === "running");
    items.push({
      jobId: c.id, status: c.data.status, error: c.data.error,
      product: { name: input.productData?.name, image: input.productData?.images[0], price: input.productData?.price, currency: input.productData?.currency, url: input.productData?.url },
      step: runningStep ? { agent: runningStep.agent, message: runningStep.message } : null,
      done: c.data.steps.filter((s) => s.status === "done" || s.status === "skipped").length, total: c.data.steps.length,
      projects, renders, photoAssetIds: c.data.result?.photoAssetIds ?? [], musicAssetIds: c.data.result?.musicAssetIds ?? [], clipAssetId: c.data.result?.clipAssetId,
    });
  }
  return { id: batch.id, status: batch.data.status, input: batch.data.input, items };
});
