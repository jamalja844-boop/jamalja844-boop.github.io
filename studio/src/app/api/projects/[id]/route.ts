import { z } from "zod";
import { db } from "@/lib/server/db";
import { HttpError, requireUser } from "@/lib/server/auth";
import { handler } from "@/lib/server/http";
import { analyzeProject } from "@/lib/agents/analyst";
import type { ProjectData, VersionData } from "@/lib/models";
import type { ProjectDoc } from "@/remotion/types";

type P = { params: Promise<{ id: string }> };
const MAX_AUTO_VERSIONS = 30;

async function load(id: string, owner: string) {
  const row = await db.getOwned<ProjectData>("projects", id, owner);
  if (!row) throw new HttpError(404, "Project not found");
  return row;
}

export const GET = handler(async (_req: Request, { params }: P) => {
  const u = await requireUser();
  const row = await load((await params).id, u.id);
  return { id: row.id, updatedAt: row.updated_at, ...row.data };
});

const DocShape = z.object({ version: z.literal(1), name: z.string().max(200), width: z.number().int().min(16).max(4096), height: z.number().int().min(16).max(4096), fps: z.number().int().min(1).max(60), durationInFrames: z.number().int().min(1).max(60 * 60 * 3), tracks: z.array(z.any()).max(60), scenes: z.array(z.any()).max(100) }).passthrough();

export const PUT = handler(async (req: Request, { params }: P) => {
  const u = await requireUser();
  const row = await load((await params).id, u.id);
  const b = z.object({ doc: DocShape, baseUpdatedAt: z.string().optional(), isTemplate: z.boolean().optional(), autosave: z.boolean().optional() }).parse(await req.json());
  const doc = b.doc as unknown as ProjectDoc;
  if (JSON.stringify(doc).length > 5_000_000) throw new HttpError(413, "Project too large");
  if (b.baseUpdatedAt && b.baseUpdatedAt < row.updated_at && !b.autosave) {
    // another tab saved in the meantime: keep their copy as a version so nothing is lost
    await db.insert<VersionData>("versions", u.id, { projectId: row.id, doc: row.data.doc, label: "Conflict backup", auto: true });
  }
  doc.meta = { ...doc.meta, analysis: analyzeProject(doc) };
  const next = await db.update("projects", row, { ...row.data, doc, isTemplate: b.isTemplate ?? row.data.isTemplate });
  // autosave keeps a rolling history of versions (at most one per 2 minutes)
  const versions = await db.list<VersionData>("versions", u.id, { projectId: row.id });
  const lastAuto = versions.find((v) => v.data.auto);
  if (!lastAuto || Date.now() - new Date(lastAuto.created_at).getTime() > 120_000) {
    await db.insert<VersionData>("versions", u.id, { projectId: row.id, doc, label: "Autosave", auto: true });
    for (const old of versions.filter((v) => v.data.auto).slice(MAX_AUTO_VERSIONS - 1)) await db.del("versions", old.id);
  }
  return { updatedAt: next.updated_at, analysis: doc.meta.analysis };
});

export const DELETE = handler(async (_req: Request, { params }: P) => {
  const u = await requireUser();
  const row = await load((await params).id, u.id);
  for (const v of await db.list<VersionData>("versions", u.id, { projectId: row.id })) await db.del("versions", v.id);
  await db.del("projects", row.id);
  return { ok: true };
});
