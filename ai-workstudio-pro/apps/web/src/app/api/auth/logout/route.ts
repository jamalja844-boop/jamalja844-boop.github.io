import { NextResponse } from "next/server";
import { publicHandler } from "@/lib/api/handler";
import { destroySession, sessionCookieName } from "@/lib/auth/session";

export const POST = publicHandler(async ({ req }) => {
  await destroySession(req.cookies.get(sessionCookieName())?.value);
  const res = NextResponse.json({ redirect: "/login" });
  res.cookies.delete(sessionCookieName());
  return res;
});
