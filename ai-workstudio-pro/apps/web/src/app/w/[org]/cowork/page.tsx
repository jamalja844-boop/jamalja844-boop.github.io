import { Suspense } from "react";
import { requireOrg } from "@/lib/auth/context";
import { withTenant } from "@/lib/db";
import { studioOptions } from "@/lib/studio-options";
import { listStyles } from "@/lib/writing/service";
import { CoworkClient } from "@/components/cowork/cowork-client";

export const metadata = { title: "Cowork" };

export default async function CoworkPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireOrg(org, "cowork.use");
  const [options, styles] = await Promise.all([studioOptions(ctx.tenant, ctx.role), withTenant(ctx.tenant, (tx) => listStyles(tx))]);
  const models = options.models.map((m) => ({ value: `${m.provider}::${m.model_id}`, label: m.display_name, available: m.available }));
  return (
    <Suspense>
      <CoworkClient slug={org} models={models} styles={styles} />
    </Suspense>
  );
}
