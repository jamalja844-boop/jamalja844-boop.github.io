import { requireOrg } from "@/lib/auth/context";
import { withTenant } from "@/lib/db";
import { providerStatuses } from "@/lib/ai/service";
import { demoProviderEnabled } from "@/lib/env";
import { serialize } from "@/lib/utils";
import { PageHeader } from "@/components/ui/misc";
import { SettingsClient } from "@/components/settings/settings-client";

export const metadata = { title: "Instellingen" };

export default async function SettingsPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { org } = await params;
  const { tab } = await searchParams;
  const ctx = await requireOrg(org);
  const data = await withTenant(ctx.tenant, async (tx) => {
    const providers = await providerStatuses(tx);
    const models = await tx`
      select id, provider, model_id, display_name, kind, input_price, output_price, is_enabled, is_default, source, verified_at, context_window
        from ai_models ${demoProviderEnabled() ? tx`` : tx`where provider <> 'demo'`}
       order by kind, provider, display_name`;
    const members = await tx`
      select m.user_id, u.name, u.email, m.role, m.created_at from memberships m join users u on u.id = m.user_id
       where m.org_id = app_org_id() order by m.created_at`;
    const audit = ctx.can("audit.view")
      ? await tx`select a.id, a.action, u.name as actor_name, a.actor_label, a.target_type, a.target_id, a.created_at, a.metadata
                   from audit_logs a left join users u on u.id = a.actor_user_id order by a.created_at desc limit 200`
      : [];
    const [usage] = await tx`select coalesce(sum(cost_usd), 0)::float as cost_month, coalesce(sum(input_tokens + output_tokens), 0)::int as tokens_month
                               from usage_events where created_at >= date_trunc('month', now())`;
    return serialize({ providers, models, members, audit, usage });
  });
  return (
    <>
      <PageHeader eyebrow="Beheer" title="Instellingen" description="AI-providers, modellen, workspace, leden en auditlog." />
      <SettingsClient
        slug={org}
        tab={tab && ["providers", "models", "workspace", "members", "audit"].includes(tab) ? tab : "providers"}
        providers={data.providers}
        models={data.models as never}
        members={data.members as never}
        audit={data.audit as never}
        org={{ name: ctx.org.name, description: ctx.org.description, retentionDays: ctx.org.retentionDays, monthlyBudgetUsd: ctx.org.monthlyBudgetUsd }}
        can={{
          credentials: ctx.can("credentials.manage"),
          models: ctx.can("models.manage"),
          org: ctx.can("org.manage"),
          members: ctx.can("members.manage"),
          audit: ctx.can("audit.view"),
        }}
        currentUserId={ctx.user.id}
        usage={data.usage as { cost_month: number; tokens_month: number }}
      />
    </>
  );
}
