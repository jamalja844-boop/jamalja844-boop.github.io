import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { env } from "@/lib/env";
import { ApiError, forbidden, notFound } from "@/lib/api/errors";
import { getSessionUser, sessionCookieName, type SessionUser } from "@/lib/auth/session";
import { loadOrgContext, type OrgContext } from "@/lib/auth/context";
import type { Permission } from "@/lib/auth/rbac";
import { rateLimit } from "@/lib/security/ratelimit";

export function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
}

/** CSRF-bescherming: muterende verzoeken moeten van dezelfde origin komen (naast SameSite=Lax cookies). */
export function checkOrigin(req: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  const site = req.headers.get("sec-fetch-site");
  if (origin) {
    let host: string;
    try {
      host = new URL(origin).host;
    } catch {
      throw new ApiError(403, "Ongeldige origin");
    }
    const allowed = new Set([req.headers.get("host"), new URL(env().APP_URL).host].filter(Boolean));
    if (!allowed.has(host)) throw new ApiError(403, "Verzoek van een andere website geweigerd (CSRF-bescherming)");
  } else if (site && site !== "same-origin" && site !== "none") {
    throw new ApiError(403, "Verzoek van een andere website geweigerd (CSRF-bescherming)");
  }
}

export async function userFromRequest(req: NextRequest): Promise<SessionUser | null> {
  return getSessionUser(req.cookies.get(sessionCookieName())?.value);
}

export async function parseJson<T>(req: NextRequest, schema: ZodType<T>, maxBytes = 1_000_000): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) throw new ApiError(413, "Verzoek is te groot");
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(400, "Ongeldige JSON");
  }
  return schema.parse(data);
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    const res = NextResponse.json({ error: err.message, details: err.details ?? null }, { status: err.status });
    if (err.status === 429 && err.details?.retryAfter) res.headers.set("Retry-After", String(err.details.retryAfter));
    return res;
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: "Ongeldige invoer", details: { issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } },
      { status: 400 },
    );
  }
  const pg = err as { code?: string; message?: string; constraint_name?: string };
  if (pg?.code === "23505") return NextResponse.json({ error: "Dit item bestaat al (naam of sleutel is al in gebruik)" }, { status: 409 });
  if (pg?.code === "42501") return NextResponse.json({ error: "Geen toegang tot deze gegevens" }, { status: 403 });
  if (pg?.code === "23503") return NextResponse.json({ error: "Verwijzing naar een onbekend of verwijderd item" }, { status: 400 });
  if (pg?.code === "23514") return NextResponse.json({ error: `Ongeldige waarde (${pg.constraint_name ?? "controle"})` }, { status: 400 });
  console.error("[api] onverwachte fout", err);
  return NextResponse.json({ error: "Er ging iets mis op de server" }, { status: 500 });
}

interface OrgHandlerArgs<P> {
  req: NextRequest;
  ctx: OrgContext;
  params: P;
  ip: string | null;
}

interface HandlerOptions {
  permission?: Permission;
  rate?: { name: string; limit: number; windowSec: number };
}

/** Route-handler voor workspace-API's: CSRF, sessie, lidmaatschap, rechten, rate limit, foutafhandeling. */
export function orgHandler<P extends { org: string }>(
  opts: HandlerOptions,
  fn: (args: OrgHandlerArgs<P>) => Promise<unknown>,
) {
  return async (req: NextRequest, route: { params: Promise<P> }) => {
    try {
      checkOrigin(req);
      const user = await userFromRequest(req);
      if (!user) throw new ApiError(401, "Je bent niet ingelogd");
      const params = await route.params;
      const ctx = await loadOrgContext(user, params.org);
      if (!ctx) throw notFound("Workspace");
      if (opts.permission && !ctx.can(opts.permission)) throw forbidden();
      if (opts.rate) await rateLimit(`${opts.rate.name}:${user.id}`, opts.rate.limit, opts.rate.windowSec);
      const result = await fn({ req, ctx, params, ip: clientIp(req) });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** Route-handler voor publieke/gebruikersroutes zonder workspace. */
export function publicHandler<P = Record<string, never>>(
  fn: (args: { req: NextRequest; params: P; ip: string | null }) => Promise<unknown>,
) {
  return async (req: NextRequest, route: { params: Promise<P> }) => {
    try {
      checkOrigin(req);
      const params = route?.params ? await route.params : ({} as P);
      const result = await fn({ req, params, ip: clientIp(req) });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}
