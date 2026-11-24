import { z } from "zod";
import { db } from "@/lib/server/db";
import { requireUser, type UserData } from "@/lib/server/auth";
import { handler } from "@/lib/server/http";

export const GET = handler(async () => requireUser());
export const PATCH = handler(async (req: Request) => {
  const u = await requireUser();
  const b = z.object({ locale: z.enum(["en", "nl"]).optional(), name: z.string().min(1).max(100).optional() }).parse(await req.json());
  const row = (await db.get<UserData>("users", u.id))!;
  await db.update("users", row, { ...row.data, ...b });
  return { ok: true };
});
