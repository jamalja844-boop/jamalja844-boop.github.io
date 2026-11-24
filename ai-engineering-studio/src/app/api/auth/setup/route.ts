import { NextResponse } from "next/server";
import { publicHandler, parseJson } from "@/lib/api/handler";
import { register, setupSchema } from "@/lib/auth/service";
import { sessionCookieName, sessionCookieOptions } from "@/lib/auth/session";

export const POST = publicHandler(async ({ req, ip }) => {
  const input = await parseJson(req, setupSchema, 10_000);
  const result = await register(input, { ip, userAgent: req.headers.get("user-agent") });
  const res = NextResponse.json({ redirect: `/w/${result.slug}?welkom=1` });
  res.cookies.set(sessionCookieName(), result.token, sessionCookieOptions(result.expires));
  return res;
});
