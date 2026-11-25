import { z } from "zod";
import { db } from "@/lib/server/db";
import { HttpError, requireUser } from "@/lib/server/auth";
import { handler } from "@/lib/server/http";
import { cancelPost, type PostData } from "@/lib/social/posts";

type P = { params: Promise<{ id: string }> };

export const POST = handler(async (req: Request, { params }: P) => {
  const u = await requireUser();
  const { id } = await params;
  const b = z.object({ action: z.enum(["cancel", "publish_now", "retry"]), caption: z.string().max(5000).optional() }).parse(await req.json());
  if (b.action === "cancel") return cancelPost(u.id, id).then(() => ({ ok: true }));
  const p = await db.getOwned<PostData>("posts", id, u.id);
  if (!p) throw new HttpError(404, "Post not found");
  if (!["scheduled", "failed", "partial", "cancelled"].includes(p.data.status)) throw new HttpError(400, `Post is ${p.data.status}`);
  await db.update("posts", p, { ...p.data, status: "scheduled", attempts: 0, scheduledAt: new Date().toISOString(), log: [...p.data.log, `${b.action} requested ${new Date().toISOString()}`] });
  return { ok: true };
});

export const DELETE = handler(async (_req: Request, { params }: P) => {
  const u = await requireUser();
  const p = await db.getOwned<PostData>("posts", (await params).id, u.id);
  if (!p) throw new HttpError(404, "Post not found");
  if (p.data.status === "publishing") throw new HttpError(400, "Post is being published");
  await db.del("posts", p.id);
  return { ok: true };
});
