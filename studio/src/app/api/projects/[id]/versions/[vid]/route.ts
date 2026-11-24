import { db } from "@/lib/server/db";
import { HttpError, requireUser } from "@/lib/server/auth";
import { handler } from "@/lib/server/http";
import type { ProjectData, VersionData } from "@/lib/models";

type P = { params: Promise<{ id: string; vid: string }> };

/** Restore a version (the current state is saved as a version first). */
export const POST = handler(async (_req: Request, { params }: P) => {
  const u = await requireUser();
  const { id, vid } = await params;
  const row = await db.getOwned<ProjectData>("projects", id, u.id);
  const v = await db.getOwned<VersionData>("versions", vid, u.id);
  if (!row || !v || v.data.projectId !== id) throw new HttpError(404, "Not found");
  await db.insert<VersionData>("versions", u.id, { projectId: id, doc: row.data.doc, label: "Before restore", auto: false });
  const next = await db.update("projects", row, { ...row.data, doc: v.data.doc });
  return { updatedAt: next.updated_at, doc: v.data.doc };
});
