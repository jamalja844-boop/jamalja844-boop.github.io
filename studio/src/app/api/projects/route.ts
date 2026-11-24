import { z } from "zod";
import { db } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import { handler } from "@/lib/server/http";
import { emptyProject } from "@/remotion/defaults";
import type { ProjectData } from "@/lib/models";

export const GET = handler(async (req: Request) => {
  const u = await requireUser();
  const tpl = new URL(req.url).searchParams.get("templates") === "1";
  const rows = await db.list<ProjectData>("projects", u.id);
  return rows
    .filter((r) => !!r.data.isTemplate === tpl)
    .map((r) => ({ id: r.id, name: r.data.doc.name, aspect: r.data.doc.aspect, style: r.data.doc.style, seconds: r.data.doc.durationInFrames / r.data.doc.fps, groupId: r.data.groupId, brandKitId: r.data.brandKitId, updatedAt: r.updated_at, score: (r.data.doc.meta?.analysis as { score?: number } | undefined)?.score, variantLabel: r.data.doc.meta?.variantLabel }));
});

export const POST = handler(async (req: Request) => {
  const u = await requireUser();
  const b = z.object({ name: z.string().max(200).default("Untitled ad"), aspect: z.enum(["9:16", "16:9", "1:1", "4:5"]).default("9:16"), seconds: z.number().int().min(1).max(120).default(15), brandKitId: z.string().optional() }).parse(await req.json());
  const row = await db.insert<ProjectData>("projects", u.id, { doc: emptyProject(b.aspect, b.seconds, b.name), brandKitId: b.brandKitId });
  return { id: row.id };
});
