import { db } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import { handler } from "@/lib/server/http";
import { PostInput, schedulePost, type PostData } from "@/lib/social/posts";

export const GET = handler(async () => {
  const u = await requireUser();
  const rows = await db.list<PostData>("posts", u.id);
  return rows.sort((a, b) => a.data.scheduledAt.localeCompare(b.data.scheduledAt)).map((r) => ({ id: r.id, createdAt: r.created_at, ...r.data }));
});

export const POST = handler(async (req: Request) => {
  const u = await requireUser();
  const row = await schedulePost(u.id, PostInput.parse(await req.json()), "app");
  return { id: row.id };
});
