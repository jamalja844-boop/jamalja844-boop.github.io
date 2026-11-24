import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { loadOrgContext } from "@/lib/auth/context";
import { userFromRequest } from "@/lib/api/handler";
import { safeEqual } from "@/lib/security/crypto";
import { completeGithubOAuth } from "@/lib/github/service";

/** OAuth-callback van GitHub: controleert de state, wisselt de code om en bewaart het token versleuteld. */
export async function GET(req: NextRequest) {
  const e = env();
  let cookie: { state?: string; org?: string } = {};
  try {
    cookie = JSON.parse(req.cookies.get("gh_oauth")?.value ?? "{}");
  } catch {
    /* leeg */
  }
  const back = (q: string) => {
    const res = NextResponse.redirect(`${e.APP_URL}${cookie.org && /^[a-z0-9-]{1,40}$/.test(cookie.org) ? `/w/${cookie.org}/code?${q}` : "/"}`);
    res.cookies.delete({ name: "gh_oauth", path: "/api/integrations/github" });
    return res;
  };
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const code = req.nextUrl.searchParams.get("code");
  if (!cookie.state || !cookie.org || !safeEqual(cookie.state, state)) return back(`github_error=${encodeURIComponent("Ongeldige of verlopen koppeling. Probeer opnieuw.")}`);
  if (!code) return back(`github_error=${encodeURIComponent(req.nextUrl.searchParams.get("error_description") ?? "Koppeling geannuleerd")}`);
  const user = await userFromRequest(req);
  if (!user) return NextResponse.redirect(`${e.APP_URL}/login`);
  const ctx = await loadOrgContext(user, cookie.org);
  if (!ctx || !ctx.can("code.use")) return back(`github_error=${encodeURIComponent("Geen toegang tot AI Code in deze workspace")}`);
  try {
    const { login } = await completeGithubOAuth(ctx.tenant, code);
    return back(`github=${encodeURIComponent(login)}`);
  } catch (err) {
    return back(`github_error=${encodeURIComponent(err instanceof Error ? err.message : "Koppelen mislukt")}`);
  }
}
