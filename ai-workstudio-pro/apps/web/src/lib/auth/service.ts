import { z } from "zod";
import { withSystem, withTenant } from "@/lib/db";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/api/errors";
import { fakeVerify, hashPassword, passwordProblems, verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/ratelimit";
import { randomToken, sha256 } from "@/lib/security/crypto";
import { audit } from "@/lib/security/audit";
import { createOrganization, slugify } from "@/lib/orgs/service";
import type { OrgRole } from "@/lib/auth/rbac";

export const emailSchema = z.string().trim().toLowerCase().max(254).email("Ongeldig e-mailadres");

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(200) });

export async function login(input: z.infer<typeof loginSchema>, meta: { ip: string | null; userAgent: string | null }) {
  await rateLimit(`login-ip:${meta.ip ?? "onbekend"}`, 30, 600);
  await rateLimit(`login-email:${input.email}`, 10, 600);

  const [user] = await withSystem((tx) => tx<{ id: string; password_hash: string; locked_until: Date | null; failed_login_count: number }[]>`
    select id, password_hash, locked_until, failed_login_count from users where email = ${input.email}`);
  if (!user) {
    await fakeVerify(input.password);
    throw new ApiError(401, "Onjuist e-mailadres of wachtwoord");
  }
  if (user.locked_until && user.locked_until > new Date()) {
    throw new ApiError(423, "Account tijdelijk vergrendeld na te veel mislukte pogingen. Probeer het over 15 minuten opnieuw.");
  }
  const ok = await verifyPassword(input.password, user.password_hash);
  if (!ok) {
    await withSystem((tx) => tx`
      update users set failed_login_count = failed_login_count + 1,
        locked_until = case when failed_login_count + 1 >= 10 then now() + interval '15 minutes' else locked_until end
      where id = ${user.id}`);
    throw new ApiError(401, "Onjuist e-mailadres of wachtwoord");
  }
  const session = await createSession(user.id, meta);
  return { userId: user.id, ...session };
}

export const setupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: emailSchema,
  password: z.string().min(1).max(200),
  orgName: z.string().trim().min(2).max(80),
});

export async function needsSetup(): Promise<boolean> {
  const [row] = await withSystem((tx) => tx<{ n: number }[]>`select count(*)::int as n from users`);
  return row.n === 0;
}

/** Eerste installatie (of open registratie als ALLOW_SIGNUP=true): gebruiker + eigen workspace. */
export async function register(input: z.infer<typeof setupSchema>, meta: { ip: string | null; userAgent: string | null }) {
  await rateLimit(`register-ip:${meta.ip ?? "onbekend"}`, 5, 3600);
  const first = await needsSetup();
  if (!first && env().ALLOW_SIGNUP !== "true") throw new ApiError(403, "Registratie is gesloten. Vraag een uitnodiging aan een beheerder.");
  const problems = passwordProblems(input.password, input.email);
  if (problems.length) throw new ApiError(400, `Wachtwoord moet ${problems.join(", ")}.`);
  const passwordHash = await hashPassword(input.password);

  const { userId, slug } = await withSystem(async (tx) => {
    const [user] = await tx<{ id: string }[]>`
      insert into users (email, name, password_hash, is_platform_admin)
      values (${input.email}, ${input.name}, ${passwordHash}, ${first}) returning id`;
    let slug = slugify(input.orgName);
    const [taken] = await tx<{ n: number }[]>`select count(*)::int as n from organizations where slug = ${slug}`;
    if (taken.n > 0) slug = `${slug.slice(0, 33)}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
    const orgId = await createOrganization(tx, { slug, name: input.orgName, ownerUserId: user.id });
    await tx`insert into audit_logs (org_id, actor_user_id, action, target_type, target_id)
             values (${orgId}, ${user.id}, 'user.registered', 'user', ${user.id})`;
    return { userId: user.id, slug };
  });
  const session = await createSession(userId, meta);
  return { userId, slug, ...session };
}

// ---------------------------------------------------------------------------
// Uitnodigingen
// ---------------------------------------------------------------------------
export async function createInvitation(ctx: { userId: string; orgId: string }, email: string, role: OrgRole) {
  if (role === "owner") throw new ApiError(400, "Eigenaarschap kan niet via een uitnodiging worden toegekend.");
  const token = randomToken(32);
  await withTenant(ctx, async (tx) => {
    await tx`insert into invitations (org_id, email, role, token_hash, invited_by, expires_at)
             values (app_org_id(), ${email}, ${role}, ${sha256(token)}, app_user_id(), now() + interval '7 days')`;
    await audit(tx, { action: "member.invited", targetType: "invitation", metadata: { email, role } });
  });
  return { token, url: `${env().APP_URL}/invite/${token}` };
}

export async function getInvitation(token: string) {
  const [inv] = await withSystem((tx) => tx<{ id: string; email: string; role: OrgRole; org_name: string; org_slug: string; user_exists: boolean }[]>`
    select i.id, i.email, i.role, o.name as org_name, o.slug as org_slug,
           exists (select 1 from users u where u.email = i.email) as user_exists
      from invitations i join organizations o on o.id = i.org_id
     where i.token_hash = ${sha256(token)} and i.accepted_at is null and i.expires_at > now()`);
  return inv ?? null;
}

export const acceptInviteSchema = z.object({
  token: z.string().min(20).max(100),
  name: z.string().trim().min(1).max(120).optional(),
  password: z.string().min(1).max(200),
});

export async function acceptInvitation(input: z.infer<typeof acceptInviteSchema>, meta: { ip: string | null; userAgent: string | null }) {
  await rateLimit(`invite-ip:${meta.ip ?? "onbekend"}`, 20, 3600);
  const inv = await getInvitation(input.token);
  if (!inv) throw new ApiError(404, "Deze uitnodiging is ongeldig of verlopen.");

  let userId: string;
  if (inv.user_exists) {
    const [u] = await withSystem((tx) => tx<{ id: string; password_hash: string }[]>`select id, password_hash from users where email = ${inv.email}`);
    if (!(await verifyPassword(input.password, u.password_hash))) throw new ApiError(401, "Onjuist wachtwoord voor dit bestaande account.");
    userId = u.id;
  } else {
    if (!input.name) throw new ApiError(400, "Vul je naam in.");
    const problems = passwordProblems(input.password, inv.email);
    if (problems.length) throw new ApiError(400, `Wachtwoord moet ${problems.join(", ")}.`);
    const hash = await hashPassword(input.password);
    const [u] = await withSystem((tx) => tx<{ id: string }[]>`
      insert into users (email, name, password_hash) values (${inv.email}, ${input.name!}, ${hash}) returning id`);
    userId = u.id;
  }
  await withSystem(async (tx) => {
    const [claimed] = await tx<{ org_id: string }[]>`
      update invitations set accepted_at = now() where id = ${inv.id} and accepted_at is null returning org_id`;
    if (!claimed) throw new ApiError(409, "Deze uitnodiging is al gebruikt.");
    await tx`insert into memberships (org_id, user_id, role) values (${claimed.org_id}, ${userId}, ${inv.role})
             on conflict (org_id, user_id) do nothing`;
    await tx`insert into audit_logs (org_id, actor_user_id, action, target_type, target_id, metadata)
             values (${claimed.org_id}, ${userId}, 'member.joined', 'user', ${userId}, ${tx.json({ role: inv.role })})`;
  });
  const session = await createSession(userId, meta);
  return { userId, slug: inv.org_slug, ...session };
}
