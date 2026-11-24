import { requireOrg } from "@/lib/auth/context";
import { withTenant } from "@/lib/db";
import { serialize } from "@/lib/utils";
import { PageHeader } from "@/components/ui/misc";
import { ApprovalsClient } from "@/components/approvals/approvals-client";

export const metadata = { title: "Goedkeuringen" };

export default async function ApprovalsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireOrg(org, "dashboard.view");
  const data = await withTenant(ctx.tenant, async (tx) => {
    await tx`update approval_requests set status = 'expired' where status = 'pending' and expires_at < now()`;
    const q = (pending: boolean) => tx`
      select a.id, a.kind, a.title, a.summary, a.payload, a.risk_level, a.status, a.decided_at, a.decision_note, a.created_at, a.expires_at,
             u.name as requester, ag.name as agent_name, d.name as decided_by_name
        from approval_requests a
        left join users u on u.id = a.requested_by_user_id
        left join agents ag on ag.id = a.requested_by_agent_id
        left join users d on d.id = a.decided_by
       where ${pending ? tx`a.status = 'pending'` : tx`a.status <> 'pending'`}
       order by a.created_at desc limit 100`;
    return serialize({ pending: await q(true), history: await q(false) });
  });
  return (
    <>
      <PageHeader eyebrow="Beheer" title="Goedkeuringen" description="Controle en goedkeuring van externe en gevoelige acties (e-mails versturen, gegevens verwijderen, publicaties, wijzigende API-verzoeken)." />
      <ApprovalsClient slug={org} pending={data.pending as never} history={data.history as never} canDecide={ctx.can("approvals.decide")} />
    </>
  );
}
