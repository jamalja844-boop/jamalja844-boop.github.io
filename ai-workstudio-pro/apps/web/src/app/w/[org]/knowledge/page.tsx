import { requireOrg } from "@/lib/auth/context";
import { withTenant } from "@/lib/db";
import { studioOptions } from "@/lib/studio-options";
import { serialize } from "@/lib/utils";
import { PageHeader } from "@/components/ui/misc";
import { KnowledgeClient } from "@/components/knowledge/knowledge-client";

export const metadata = { title: "Kennisbank" };

export default async function KnowledgePage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireOrg(org, "knowledge.view");
  const data = await withTenant(ctx.tenant, async (tx) => {
    const kbs = await tx`
      select kb.id, kb.name, kb.description, kb.min_role, kb.embedding_model,
             (select count(*)::int from documents d where d.knowledge_base_id = kb.id) as documents,
             (select count(*)::int from document_chunks c where c.knowledge_base_id = kb.id) as chunks
        from knowledge_bases kb order by kb.name`;
    const docs = await tx<{ knowledge_base_id: string }[]>`
      select id, knowledge_base_id, title, filename, size_bytes, min_role, status, error, chunk_count, has_embeddings, created_at
        from documents order by created_at desc`;
    const docsByKb: Record<string, unknown[]> = {};
    for (const d of docs) (docsByKb[d.knowledge_base_id] ??= []).push(d);
    return serialize({ kbs, docsByKb });
  });
  const options = await studioOptions(ctx.tenant, ctx.role);
  return (
    <>
      <PageHeader eyebrow="Module 5 · RAG Knowledge Base" title="Kennisbank" description="Upload bedrijfsdocumenten; ze worden verwerkt, opgedeeld en doorzoekbaar gemaakt met pgvector en full-text search. AI-antwoorden verwijzen naar bronnen en verzinnen geen bedrijfsinformatie." />
      <KnowledgeClient slug={org} kbs={data.kbs as never} docsByKb={data.docsByKb as never} options={options} canManage={ctx.can("knowledge.manage")} />
    </>
  );
}
