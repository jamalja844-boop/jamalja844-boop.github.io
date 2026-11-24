import { NextResponse } from "next/server";
import { publicHandler, parseJson } from "@/lib/api/handler";
import { login, loginSchema } from "@/lib/auth/service";
import { sessionCookieName, sessionCookieOptions } from "@/lib/auth/session";
import { listMyOrgs } from "@/lib/auth/context";

export const POST = publicHandler(async ({ req, ip }) => {
  const input = await parseJson(req, loginSchema, 10_000);
  const session = await login(input, { ip, userAgent: req.headers.get("user-agent") });
  const orgs = await listMyOrgs(session.userId);
  const res = NextResponse.json({ redirect: orgs[0] ? `/w/${orgs[0].slug}/chat` : "/" });
  res.cookies.set(sessionCookieName(), session.token, sessionCookieOptions(session.expires));
  return res;
});
