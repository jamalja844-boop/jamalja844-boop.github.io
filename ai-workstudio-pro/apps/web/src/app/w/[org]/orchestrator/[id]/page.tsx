import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/auth/context";
import { withTenant } from "@/lib/db";
import { loadOrchestration } from "@/lib/orchestrator/queries";
import { serialize } from "@/lib/utils";
import { PageHeader } from "@/components/ui/misc";
import { OrchestrationView } from "@/components/orchestrator/orchestrator-client";

export const metadata = { title: "Opdracht" };

export default async function OrchestrationPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const ctx = await requireOrg(org, "agents.view");
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await withTenant(ctx.tenant, (tx) => loadOrchestration(tx, id));
  if (!data) notFound();
  return (
    <>
      <PageHeader eyebrow="AI Orchestrator" title={data.orchestration.title as string} actions={<Link href={`/w/${org}/orchestrator`} className="text-sm text-muted-foreground hover:underline">← Alle opdrachten</Link>} />
      <OrchestrationView slug={org} initial={serialize(data) as never} />
    </>
  );
}
