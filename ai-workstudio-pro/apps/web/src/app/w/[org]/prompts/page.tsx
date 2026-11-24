import { requireOrg } from "@/lib/auth/context";
import { withTenant } from "@/lib/db";
import { serialize } from "@/lib/utils";
import { PageHeader } from "@/components/ui/misc";
import { PromptList } from "@/components/prompts/prompt-list";

export const metadata = { title: "Prompt Studio" };

export default async function PromptsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireOrg(org, "prompts.view");
  const prompts = await withTenant(ctx.tenant, (tx) => tx`
    select p.id, p.name, p.description, p.tags, p.current_version, p.updated_at,
           (select count(*)::int from prompt_versions v where v.prompt_id = p.id) as versions
      from prompts p order by p.updated_at desc`);
  return (
    <>
      <PageHeader eyebrow="Module 2 · Prompt Engineering Studio" title="Prompt Studio" description="Bouw prompts visueel met rol, context, doel, variabelen en uitvoerformaat. Elke wijziging is een nieuwe versie; test varianten naast elkaar en koppel prompts aan agents." />
      <PromptList slug={org} prompts={serialize(prompts) as never} canManage={ctx.can("prompts.manage")} />
    </>
  );
}
