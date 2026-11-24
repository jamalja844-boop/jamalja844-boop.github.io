import { z } from "zod";
import { db } from "@/lib/server/db";
import { HttpError, requireUser } from "@/lib/server/auth";
import { handler } from "@/lib/server/http";
import { reformat } from "@/lib/engine/reformat";
import type { ProjectData } from "@/lib/models";

export const POST = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const u = await requireUser();
  const { id } = await params;
  const b = z.object({ aspect: z.enum(["9:16", "16:9", "1:1", "4:5"]).optional(), asTemplate: z.boolean().optional(), name: z.string().max(200).optional() }).parse(await req.json().catch(() => ({})));
  const row = await db.getOwned<ProjectData>("projects", id, u.id);
  if (!row) throw new HttpError(404, "Project not found");
  let doc = structuredClone(row.data.doc);
  if (b.aspect && b.aspect !== doc.aspect) doc = reformat(doc, b.aspect);
  doc.name = b.name ?? `${doc.name}${b.aspect ? ` (${b.aspect})` : " (copy)"}`;
  const copy = await db.insert<ProjectData>("projects", u.id, { ...row.data, doc, isTemplate: b.asTemplate ?? false });
  return { id: copy.id };
});
