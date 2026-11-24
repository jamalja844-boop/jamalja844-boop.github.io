import { AppShell } from "@/components/shell/sidebar";
import { listMyOrgs, requireOrg } from "@/lib/auth/context";
import { ROLE_LABELS } from "@/lib/auth/rbac";
import { withTenant } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const ctx = await requireOrg(slug);
  const [orgs, [pending]] = await Promise.all([
    listMyOrgs(ctx.user.id),
    withTenant(ctx.tenant, (tx) => tx<{ n: number }[]>`select count(*)::int as n from approval_requests where status = 'pending'`),
  ]);
  return (
    <AppShell
      org={{ slug: ctx.org.slug, name: ctx.org.name, isDemo: ctx.org.isDemo }}
      orgs={orgs}
      user={{ name: ctx.user.name, email: ctx.user.email, avatarColor: ctx.user.avatarColor }}
      roleLabel={ROLE_LABELS[ctx.role]}
      pendingApprovals={ctx.can("approvals.decide") ? pending.n : 0}
    >
      {children}
    </AppShell>
  );
}
