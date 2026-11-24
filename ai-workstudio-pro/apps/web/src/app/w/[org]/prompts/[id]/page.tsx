import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/auth/context";
import { withTenant } from "@/lib/db";
import { studioOptions } from "@/lib/studio-options";
import { serialize } from "@/lib/utils";
import { Badge, PageHeader } from "@/components/ui/misc";
import { PromptEditor } from "@/components/prompts/prompt-editor";

export const metadata = { title: "Prompt bewerken" };

export default async function PromptPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const ctx = await requireOrg(org, "prompts.view");
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await withTenant(ctx.tenant, async (tx) => {
    const [prompt] = await tx`select id, name, description, tags, current_version from prompts where id = ${id}`;
    if (!prompt) return null;
    const versions = await tx`select * from prompt_versions where prompt_id = ${id} order by version desc`;
    const runs = await tx`select * from prompt_test_runs where prompt_id = ${id} order by created_at desc limit 40`;
    const agents = await tx`select id, name from agents where prompt_id = ${id}`;
    return serialize({ prompt, versions, runs, agents });
  });
  if (!data) notFound();
  const options = await studioOptions(ctx.tenant, ctx.role);
  return (
    <>
      <PageHeader
        eyebrow="Prompt Studio"
        title={data.prompt.name as string}
        description={(data.prompt.description as string) || undefined}
        actions={<><Badge tone="info">Actief: v{data.prompt.current_version as number}</Badge><Link href={`/w/${org}/prompts`} className="text-sm text-muted-foreground hover:underline">← Alle prompts</Link></>}
      />
      <PromptEditor
        slug={org}
        prompt={data.prompt as never}
        versions={data.versions as never}
        runs={data.runs as never}
        agents={data.agents as never}
        options={options}
        canManage={ctx.can("prompts.manage")}
      />
    </>
  );
}
