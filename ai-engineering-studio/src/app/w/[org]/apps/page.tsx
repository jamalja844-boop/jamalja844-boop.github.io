import { requireOrg } from "@/lib/auth/context";
import { withTenant } from "@/lib/db";
import { studioOptions } from "@/lib/studio-options";
import { serialize } from "@/lib/utils";
import { roleRank } from "@/lib/auth/rbac";
import { APP_TYPES } from "@/lib/apps/presets";
import { PageHeader } from "@/components/ui/misc";
import { AppGallery } from "@/components/apps/app-builder";

export const metadata = { title: "App Builder" };

export default async function AppsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireOrg(org, "dashboard.view");
  const manage = ctx.can("apps.manage");
  const [apps, options] = await Promise.all([
    withTenant(ctx.tenant, (tx) => tx<{ id: string; status: string; min_role: "owner" | "admin" | "developer" | "member" | "viewer" }[]>`
      select a.id, a.name, a.app_type, a.description, a.status, a.min_role, a.updated_at,
             (select count(*)::int from app_runs r where r.app_id = a.id) as runs
        from ai_apps a where a.status <> 'archived' order by a.updated_at desc`),
    studioOptions(ctx.tenant, ctx.role),
  ]);
  // Gebruikers zien alleen gepubliceerde apps waarvoor hun rol voldoende is; bouwers zien alles.
  const visible = apps.filter((a) => manage || (a.status === "published" && roleRank(ctx.role) >= roleRank(a.min_role)));
  const types = Object.entries(APP_TYPES).map(([id, t]) => ({ id, label: t.label, description: t.description }));
  return (
    <>
      <PageHeader eyebrow="Module 3 · AI App Builder" title="AI-apps" description="Bouw AI-applicaties zonder programmeerkennis: invoervelden, databronnen, prompts, tools en uitvoeropties. Test, publiceer en stel beschikbaar voor bevoegde gebruikers." />
      <AppGallery slug={org} apps={serialize(visible) as never} types={types} options={options} canManage={manage} />
    </>
  );
}
