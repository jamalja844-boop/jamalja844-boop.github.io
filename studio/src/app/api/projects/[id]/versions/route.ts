import { z } from "zod";
import { db } from "@/lib/server/db";
import { HttpError, requireUser } from "@/lib/server/auth";
import { handler } from "@/lib/server/http";
import type { ProjectData, VersionData } from "@/lib/models";

type P = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, { params }: P) => {
  const u = await requireUser();
  const { id } = await params;
  const rows = await db.list<VersionData>("versions", u.id, { projectId: id });
  return rows.map((r) => ({ id: r.id, label: r.data.label, auto: r.data.auto, createdAt: r.created_at, seconds: r.data.doc.durationInFrames / r.data.doc.fps }));
});

export const POST = handler(async (req: Request, { params }: P) => {
  const u = await requireUser();
  const { id } = await params;
  const row = await db.getOwned<ProjectData>("projects", id, u.id);
  if (!row) throw new HttpError(404, "Project not found");
  const { label } = z.object({ label: z.string().min(1).max(100) }).parse(await req.json());
  const v = await db.insert<VersionData>("versions", u.id, { projectId: id, doc: row.data.doc, label, auto: false });
  return { id: v.id };
});
