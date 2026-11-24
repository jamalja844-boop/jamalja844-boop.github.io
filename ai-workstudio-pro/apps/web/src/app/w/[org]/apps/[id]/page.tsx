import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/auth/context";
import { withTenant } from "@/lib/db";
import { roleRank } from "@/lib/auth/rbac";
import { studioOptions } from "@/lib/studio-options";
import { serialize } from "@/lib/utils";
import { APP_TYPES, type AppType } from "@/lib/apps/presets";
import { PageHeader, StatusBadge } from "@/components/ui/misc";
import { AppBuilder } from "@/components/apps/app-builder";

export const metadata = { title: "AI-app" };

export default async function AppPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const ctx = await requireOrg(org, "dashboard.view");
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [app] = await withTenant(ctx.tenant, (tx) => tx`select id, name, description, status, min_role, app_type, config from ai_apps where id = ${id}`);
  if (!app) notFound();
  const manage = ctx.can("apps.manage");
  if (!manage && (app.status !== "published" || roleRank(ctx.role) < roleRank(app.min_role) || !ctx.can("apps.use"))) notFound();
  const options = await studioOptions(ctx.tenant, ctx.role);
  return (
    <>
      <PageHeader
        eyebrow={`AI App Builder · ${APP_TYPES[app.app_type as AppType]?.label ?? app.app_type}`}
        title={app.name}
        description={app.description}
        actions={<><StatusBadge status={app.status} /><Link href={`/w/${org}/apps`} className="text-sm text-muted-foreground hover:underline">← Alle apps</Link></>}
      />
      <AppBuilder slug={org} app={serialize(app) as never} options={options} canManage={manage} />
    </>
  );
}
