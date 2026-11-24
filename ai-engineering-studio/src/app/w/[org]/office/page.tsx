import { requireOrg } from "@/lib/auth/context";
import { liveActivity } from "@/lib/dashboard";
import { PageHeader } from "@/components/ui/misc";
import { OfficeClient } from "@/components/office/office-client";

export const metadata = { title: "3D AI-kantoor" };

export default async function OfficePage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireOrg(org, "dashboard.view");
  const live = await liveActivity(ctx.tenant);
  return (
    <>
      <PageHeader eyebrow="Virtueel kantoor" title="3D AI-kantoor" description="Je AI-medewerkers aan het werk. Kleuren, beeldschermen en dataverbindingen tonen de werkelijke status uit het systeem: taken, goedkeuringen en samenwerking." />
      <OfficeClient slug={org} initial={live as never} />
    </>
  );
}
