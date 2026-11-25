import { requireUser } from "@/lib/server/auth";
import { handler } from "@/lib/server/http";
import { AutoInput, autoSchedule } from "@/lib/social/posts";

export const POST = handler(async (req: Request) => {
  const u = await requireUser();
  const rows = await autoSchedule(u.id, AutoInput.parse(await req.json()), "app");
  return rows.map((r) => ({ id: r.id, at: r.data.scheduledAt }));
});
