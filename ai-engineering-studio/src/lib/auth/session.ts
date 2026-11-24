import { withSystem } from "@/lib/db";
import { env } from "@/lib/env";
import { randomToken, sha256 } from "@/lib/security/crypto";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  avatarColor: string;
  isPlatformAdmin: boolean;
  sessionId: string;
}

export function sessionCookieName(): string {
  // __Host- prefix dwingt Secure, Path=/ en geen Domain af (alleen over HTTPS).
  return env().APP_URL.startsWith("https://") ? "__Host-studio_session" : "studio_session";
}

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: env().APP_URL.startsWith("https://"),
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

export async function createSession(userId: string, meta: { ip?: string | null; userAgent?: string | null }) {
  const token = randomToken(32);
  const expires = new Date(Date.now() + env().SESSION_TTL_HOURS * 3600_000);
  await withSystem(async (tx) => {
    await tx`insert into sessions (user_id, token_hash, ip, user_agent, expires_at)
             values (${userId}, ${sha256(token)}, ${meta.ip ?? null}, ${meta.userAgent?.slice(0, 300) ?? null}, ${expires})`;
    await tx`update users set last_login_at = now(), failed_login_count = 0, locked_until = null where id = ${userId}`;
    // Opruimen van verlopen sessies van deze gebruiker.
    await tx`delete from sessions where user_id = ${userId} and expires_at < now()`;
  });
  return { token, expires };
}

export async function getSessionUser(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token || token.length < 20 || token.length > 100) return null;
  const rows = await withSystem((tx) => tx<
    { session_id: string; last_seen_at: Date; id: string; email: string; name: string; avatar_color: string; is_platform_admin: boolean }[]
  >`select s.id as session_id, s.last_seen_at, u.id, u.email, u.name, u.avatar_color, u.is_platform_admin
      from sessions s join users u on u.id = s.user_id
     where s.token_hash = ${sha256(token)} and s.expires_at > now()`);
  const row = rows[0];
  if (!row) return null;
  if (Date.now() - new Date(row.last_seen_at).getTime() > 5 * 60_000) {
    await withSystem((tx) => tx`update sessions set last_seen_at = now() where id = ${row.session_id}`);
  }
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarColor: row.avatar_color,
    isPlatformAdmin: row.is_platform_admin,
    sessionId: row.session_id,
  };
}

export async function destroySession(token: string | undefined | null) {
  if (!token) return;
  await withSystem((tx) => tx`delete from sessions where token_hash = ${sha256(token)}`);
}

export async function destroyAllSessions(userId: string) {
  await withSystem((tx) => tx`delete from sessions where user_id = ${userId}`);
}
