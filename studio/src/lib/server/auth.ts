import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { config } from "./config";
import { db } from "./db";

export const SESSION_COOKIE = "ads_session";

export interface UserData {
  email: string;
  name: string;
  passwordHash: string;
  locale: "en" | "nl";
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  locale: "en" | "nl";
}

const key = () => new TextEncoder().encode(config.sessionSecret);

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("14d").sign(key());
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: config.appUrl.startsWith("https"), path: "/", maxAge: 60 * 60 * 24 * 14 });
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    const row = await db.get<UserData>("users", String(payload.sub));
    if (!row) return null;
    return { id: row.id, email: row.data.email, name: row.data.name, locale: row.data.locale };
  } catch {
    return null;
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function requireUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) throw new HttpError(401, "Not signed in");
  return u;
}

/* very small fixed-window rate limiter (per process) */
const buckets = new Map<string, { n: number; reset: number }>();
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    return;
  }
  b.n++;
  if (b.n > max) throw new HttpError(429, "Too many requests, try again later");
}
