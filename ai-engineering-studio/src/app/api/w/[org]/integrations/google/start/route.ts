import { NextResponse } from "next/server";
import { orgHandler } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { env } from "@/lib/env";
import { randomToken } from "@/lib/security/crypto";

const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/drive.readonly",
];

/** Start de Google OAuth-koppeling (Gmail, Agenda, Drive). */
export const GET = orgHandler({ permission: "credentials.manage" }, async ({ ctx }) => {
  const e = env();
  if (!e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET) {
    throw new ApiError(424, "GOOGLE_CLIENT_ID en GOOGLE_CLIENT_SECRET zijn nog niet ingesteld op de server (.env).", { setup: { provider: "google", where: ".env" } });
  }
  const state = randomToken(24);
  const params = new URLSearchParams({
    client_id: e.GOOGLE_CLIENT_ID,
    redirect_uri: `${e.APP_URL}/api/integrations/google/callback`,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  res.cookies.set("g_oauth", JSON.stringify({ state, org: ctx.org.slug }), {
    httpOnly: true,
    secure: e.APP_URL.startsWith("https://"),
    sameSite: "lax",
    path: "/api/integrations/google",
    maxAge: 600,
  });
  return res;
});
