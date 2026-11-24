import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { withTenant } from "@/lib/db";
import { loadOrgContext } from "@/lib/auth/context";
import { userFromRequest } from "@/lib/api/handler";
import { safeEqual } from "@/lib/security/crypto";
import { audit } from "@/lib/security/audit";
import { saveIntegration } from "@/lib/tools/integrations";
import { BUILTIN_TOOLS } from "@/lib/tools/definitions";

/** OAuth-callback van Google: wisselt de code om en bewaart tokens versleuteld. */
export async function GET(req: NextRequest) {
  const e = env();
  const fail = (msg: string, slug?: string) =>
    NextResponse.redirect(`${e.APP_URL}${slug ? `/w/${slug}/tools?tab=integrations&google_error=${encodeURIComponent(msg)}` : "/"}`);
  let cookie: { state?: string; org?: string } = {};
  try {
    cookie = JSON.parse(req.cookies.get("g_oauth")?.value ?? "{}");
  } catch {
    /* leeg */
  }
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const code = req.nextUrl.searchParams.get("code");
  if (!cookie.state || !cookie.org || !safeEqual(cookie.state, state)) return fail("Ongeldige of verlopen koppelingsstatus", cookie.org);
  if (!code) return fail(req.nextUrl.searchParams.get("error") ?? "Geen autorisatiecode ontvangen", cookie.org);

  const user = await userFromRequest(req);
  if (!user) return NextResponse.redirect(`${e.APP_URL}/login`);
  const ctx = await loadOrgContext(user, cookie.org);
  if (!ctx || !ctx.can("credentials.manage")) return fail("Geen toestemming om integraties te koppelen", cookie.org);

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: e.GOOGLE_CLIENT_ID ?? "",
      client_secret: e.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: `${e.APP_URL}/api/integrations/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  const data = (await tokenRes.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string; error_description?: string };
  if (!tokenRes.ok || !data.refresh_token) return fail(data.error_description ?? "Token ophalen mislukt (geen refresh token)", cookie.org);

  let email = "";
  try {
    email = JSON.parse(Buffer.from((data.id_token ?? "").split(".")[1] ?? "", "base64url").toString()).email ?? "";
  } catch {
    /* geen e-mail */
  }
  await saveIntegration(ctx.tenant, "google", "standaard", {
    refresh_token: data.refresh_token,
    access_token: data.access_token ?? "",
    expires_at: String(Date.now() + (data.expires_in ?? 3600) * 1000),
  }, { email });
  await withTenant(ctx.tenant, async (tx) => {
    const keys = BUILTIN_TOOLS.filter((t) => t.integration === "google").map((t) => t.key);
    await tx`update tools set is_enabled = true where key = any(${keys})`;
    await audit(tx, { action: "integration.connected", targetType: "integration", targetId: "google", metadata: { email } });
  });
  const res = NextResponse.redirect(`${e.APP_URL}/w/${cookie.org}/tools?tab=integrations&google=ok`);
  res.cookies.delete("g_oauth");
  return res;
}
