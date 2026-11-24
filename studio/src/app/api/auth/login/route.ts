import { z } from "zod";
import { db } from "@/lib/server/db";
import { createSession, HttpError, rateLimit, type UserData } from "@/lib/server/auth";
import { verifyPassword } from "@/lib/server/crypto";
import { handler } from "@/lib/server/http";

const Body = z.object({ email: z.string().email(), password: z.string().min(1) });

export const POST = handler(async (req: Request) => {
  const b = Body.parse(await req.json());
  rateLimit(`login:${b.email.toLowerCase()}`, 10, 15 * 60_000);
  const u = (await db.list<UserData>("users", null, { email: b.email.toLowerCase() }))[0];
  if (!u || !verifyPassword(b.password, u.data.passwordHash)) throw new HttpError(401, "Invalid email or password");
  await createSession(u.id);
  return { ok: true };
});
