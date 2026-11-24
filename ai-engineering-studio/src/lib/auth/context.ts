import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { withUser, type TenantContext } from "@/lib/db";
import { getSessionUser, sessionCookieName, type SessionUser } from "@/lib/auth/session";
import { permissionsFor, type OrgRole, type Permission } from "@/lib/auth/rbac";

export interface OrgInfo {
  id: string;
  slug: string;
  name: string;
  description: string;
  isDemo: boolean;
  retentionDays: number;
  monthlyBudgetUsd: number | null;
}

export interface OrgContext {
  user: SessionUser;
  org: OrgInfo;
  role: OrgRole;
  permissions: Set<Permission>;
  tenant: TenantContext;
  can: (p: Permission) => boolean;
}

export async function currentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  return getSessionUser(store.get(sessionCookieName())?.value);
}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function listMyOrgs(userId: string) {
  return withUser(userId, (tx) => tx<
    { id: string; slug: string; name: string; is_demo: boolean; role: OrgRole }[]
  >`select o.id, o.slug, o.name, o.is_demo, m.role
      from organizations o join memberships m on m.org_id = o.id and m.user_id = ${userId}
     order by o.is_demo, o.name`);
}

export async function loadOrgContext(user: SessionUser, slug: string): Promise<OrgContext | null> {
  if (!/^[a-z0-9-]{1,40}$/.test(slug)) return null;
  const rows = await withUser(user.id, (tx) => tx<
    { id: string; slug: string; name: string; description: string; is_demo: boolean; retention_days: number; monthly_budget_usd: string | null; role: OrgRole }[]
  >`select o.id, o.slug, o.name, o.description, o.is_demo, o.retention_days, o.monthly_budget_usd, m.role
      from organizations o join memberships m on m.org_id = o.id and m.user_id = ${user.id}
     where o.slug = ${slug}`);
  const row = rows[0];
  if (!row) return null;
  const permissions = await permissionsFor(row.role);
  return {
    user,
    org: {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      isDemo: row.is_demo,
      retentionDays: row.retention_days,
      monthlyBudgetUsd: row.monthly_budget_usd === null ? null : Number(row.monthly_budget_usd),
    },
    role: row.role,
    permissions,
    tenant: { userId: user.id, orgId: row.id },
    can: (p) => permissions.has(p),
  };
}

/** Voor server components: zorgt voor ingelogde gebruiker + lidmaatschap van de workspace. */
export async function requireOrg(slug: string, permission?: Permission): Promise<OrgContext> {
  const user = await requireUser();
  const ctx = await loadOrgContext(user, slug);
  if (!ctx) notFound();
  if (permission && !ctx.can(permission)) redirect(`/w/${slug}?geen-toegang=1`);
  return ctx;
}
