import { z } from "zod";
import { db } from "@/lib/server/db";
import { HttpError, requireUser } from "@/lib/server/auth";
import { handler } from "@/lib/server/http";
import { enqueueRender, queueMode } from "@/lib/server/queue";
import type { ProjectData, RenderData } from "@/lib/models";

export const GET = handler(async () => {
  const u = await requireUser();
  const rows = await db.list<RenderData>("renders", u.id);
  return { mode: queueMode(), items: rows.map((r) => ({ id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, ...r.data, doc: { aspect: r.data.doc.aspect, seconds: r.data.doc.durationInFrames / r.data.doc.fps, width: r.data.doc.width, height: r.data.doc.height } })) };
});

export const POST = handler(async (req: Request) => {
  const u = await requireUser();
  const b = z.object({ projectIds: z.array(z.string()).min(1).max(24), resolution: z.enum(["1080p", "4k"]) }).parse(await req.json());
  const ids = [];
  for (const pid of b.projectIds) {
    const p = await db.getOwned<ProjectData>("projects", pid, u.id);
    if (!p) throw new HttpError(404, "Project not found");
    const r = await db.insert<RenderData>("renders", u.id, { projectId: pid, projectName: p.data.doc.name, status: "queued", progress: 0, resolution: b.resolution, codec: "h264", attempts: 0, maxAttempts: 3, doc: p.data.doc, log: [`Queued ${new Date().toISOString()}`] });
    await enqueueRender(r.id);
    ids.push(r.id);
  }
  return { renderIds: ids };
});
