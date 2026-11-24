import { NextResponse } from "next/server";
import { orgHandler } from "@/lib/api/handler";
import { env } from "@/lib/env";
import { randomToken } from "@/lib/security/crypto";
import { authorizeUrl } from "@/lib/github/service";

/** Start de persoonlijke GitHub-koppeling (OAuth). De state staat in een kortlevende HttpOnly-cookie. */
export const GET = orgHandler({ permission: "code.use" }, async ({ ctx }) => {
  const state = randomToken(24);
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set("gh_oauth", JSON.stringify({ state, org: ctx.org.slug }), {
    httpOnly: true, secure: env().APP_URL.startsWith("https://"), sameSite: "lax", path: "/api/integrations/github", maxAge: 600,
  });
  return res;
});
