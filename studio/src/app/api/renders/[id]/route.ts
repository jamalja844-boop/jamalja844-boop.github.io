import { z } from "zod";
import { db } from "@/lib/server/db";
import { HttpError, requireUser } from "@/lib/server/auth";
import { handler } from "@/lib/server/http";
import { enqueueRender } from "@/lib/server/queue";
import type { RenderData } from "@/lib/models";

type P = { params: Promise<{ id: string }> };

export const POST = handler(async (req: Request, { params }: P) => {
  const u = await requireUser();
  const row = await db.getOwned<RenderData>("renders", (await params).id, u.id);
  if (!row) throw new HttpError(404, "Render not found");
  const { action } = z.object({ action: z.enum(["retry", "cancel"]) }).parse(await req.json());
  if (action === "cancel") {
    if (["done", "failed", "cancelled"].includes(row.data.status)) throw new HttpError(400, "Render already finished");
    await db.update("renders", row, { ...row.data, status: "cancelled", log: [...row.data.log, "Cancelled by user"] });
  } else {
    if (!["failed", "cancelled"].includes(row.data.status)) throw new HttpError(400, "Only failed or cancelled renders can be retried");
    await db.update("renders", row, { ...row.data, status: "queued", progress: 0, attempts: 0, error: undefined, log: [...row.data.log, `Retry requested ${new Date().toISOString()}`] });
    await enqueueRender(row.id);
  }
  return { ok: true };
});

export const DELETE = handler(async (_req: Request, { params }: P) => {
  const u = await requireUser();
  const row = await db.getOwned<RenderData>("renders", (await params).id, u.id);
  if (!row) throw new HttpError(404, "Render not found");
  await db.del("renders", row.id);
  return { ok: true };
});
