import { z } from "zod";
import { db } from "@/lib/server/db";
import { createSession, HttpError, rateLimit, type UserData } from "@/lib/server/auth";
import { hashPassword } from "@/lib/server/crypto";
import { handler } from "@/lib/server/http";

const Body = z.object({ email: z.string().email().max(200), password: z.string().min(10).max(200), name: z.string().min(1).max(100), locale: z.enum(["en", "nl"]).default("nl") });

export const POST = handler(async (req: Request) => {
  rateLimit(`reg:${req.headers.get("x-forwarded-for") ?? "local"}`, 10, 3600_000);
  const b = Body.parse(await req.json());
  const email = b.email.toLowerCase();
  if ((await db.list<UserData>("users", null, { email })).length) throw new HttpError(409, "An account with this email already exists");
  const u = await db.insert<UserData>("users", "system", { email, name: b.name, passwordHash: hashPassword(b.password), locale: b.locale });
  await createSession(u.id);
  return { ok: true };
});
