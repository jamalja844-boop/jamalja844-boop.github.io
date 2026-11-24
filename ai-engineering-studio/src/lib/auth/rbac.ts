import { withSystem } from "@/lib/db";

export type OrgRole = "owner" | "admin" | "developer" | "member" | "viewer";
export const ROLES: OrgRole[] = ["owner", "admin", "developer", "member", "viewer"];

export const ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Eigenaar",
  admin: "Beheerder",
  developer: "Ontwikkelaar",
  member: "Medewerker",
  viewer: "Kijker",
};

const RANK: Record<OrgRole, number> = { owner: 50, admin: 40, developer: 30, member: 20, viewer: 10 };
export const roleRank = (r: OrgRole) => RANK[r] ?? 0;
export const roleAtLeast = (role: OrgRole, min: OrgRole) => roleRank(role) >= roleRank(min);

export type Permission =
  | "org.manage" | "members.manage" | "credentials.manage" | "audit.view" | "approvals.decide"
  | "models.manage" | "prompts.manage" | "apps.manage" | "tools.manage" | "knowledge.manage"
  | "agents.manage" | "workflows.manage" | "chat.use" | "apps.use" | "tools.execute"
  | "agents.run" | "workflows.run" | "dashboard.view" | "prompts.view" | "knowledge.view" | "agents.view";

// De rechtenmatrix staat in de database (role_permissions) – zelfde bron als RLS.
let cache: { at: number; map: Map<OrgRole, Set<Permission>> } | null = null;

export async function permissionsFor(role: OrgRole): Promise<Set<Permission>> {
  if (!cache || Date.now() - cache.at > 60_000) {
    const rows = await withSystem((tx) => tx<{ role: OrgRole; permission: Permission }[]>`select role, permission from role_permissions`);
    const map = new Map<OrgRole, Set<Permission>>();
    for (const r of rows) {
      if (!map.has(r.role)) map.set(r.role, new Set());
      map.get(r.role)!.add(r.permission);
    }
    cache = { at: Date.now(), map };
  }
  return cache.map.get(role) ?? new Set();
}
