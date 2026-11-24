import { json, withTenant, type TenantContext } from "@/lib/db";
import { embedTexts } from "@/lib/ai/service";
import { chunkSections, estimateTokens } from "@/lib/rag/chunk";
import { detectType, extractText } from "@/lib/rag/extract";

export const toVectorLiteral = (v: number[]) => `[${v.map((x) => (Number.isFinite(x) ? x.toFixed(7) : "0")).join(",")}]`;

/**
 * Verwerkt een document: tekst extraheren → opdelen → embeddings → opslaan.
 * Zonder embeddingmodel wordt het document alleen via full-text search doorzocht.
 */
export async function processDocument(ctx: TenantContext, documentId: string) {
  const doc = await withTenant(ctx, async (tx) => {
    const [d] = await tx<{ id: string; filename: string; mime_type: string; min_role: string; knowledge_base_id: string; chunk_size: number; chunk_overlap: number; embedding_provider: string | null; embedding_model: string | null }[]>`
      update documents d set status = 'processing', error = null
        from knowledge_bases kb
       where d.id = ${documentId} and kb.id = d.knowledge_base_id
       returning d.id, d.filename, d.mime_type, d.min_role, d.knowledge_base_id, kb.chunk_size, kb.chunk_overlap, kb.embedding_provider, kb.embedding_model`;
    if (!d) throw new Error("Document niet gevonden");
    const [blob] = await tx<{ data: Buffer }[]>`select data from document_blobs where document_id = ${documentId}`;
    return { ...d, data: blob?.data };
  });

  try {
    if (!doc.data) throw new Error("Bestandsinhoud ontbreekt");
    const type = detectType(doc.filename, doc.mime_type);
    if (!type) throw new Error("Niet-ondersteund bestandstype");
    const sections = await extractText(type, Buffer.from(doc.data));
    const chunks = chunkSections(sections, doc.chunk_size, doc.chunk_overlap);
    if (!chunks.length) throw new Error("Geen leesbare tekst gevonden in dit document (gescande PDF? Gebruik een PDF met tekstlaag).");

    const prefer = doc.embedding_provider && doc.embedding_model ? { provider: doc.embedding_provider, model: doc.embedding_model } : null;
    let embedded: Awaited<ReturnType<typeof embedTexts>> = null;
    let embedError: string | null = null;
    try {
      embedded = await embedTexts(ctx, chunks.map((c) => c.content), prefer);
    } catch (e) {
      embedError = e instanceof Error ? e.message : String(e);
    }

    await withTenant(ctx, async (tx) => {
      await tx`delete from document_chunks where document_id = ${documentId}`;
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        const vec = embedded?.vectors[i] ? toVectorLiteral(embedded.vectors[i]) : null;
        await tx`insert into document_chunks (org_id, knowledge_base_id, document_id, chunk_index, content, token_estimate, min_role, metadata, embedding)
                 values (app_org_id(), ${doc.knowledge_base_id}, ${documentId}, ${i}, ${c.content}, ${estimateTokens(c.content)}, ${doc.min_role},
                         ${json(tx, { page: c.page ?? null })}, ${vec}::vector)`;
      }
      if (embedded && !prefer) {
        await tx`update knowledge_bases set embedding_provider = ${embedded.provider}, embedding_model = ${embedded.model}
                 where id = ${doc.knowledge_base_id} and embedding_model is null`;
      }
      await tx`update documents set status = 'ready', chunk_count = ${chunks.length},
                 char_count = ${chunks.reduce((s, c) => s + c.content.length, 0)}, has_embeddings = ${Boolean(embedded)},
                 error = ${embedError ? `Embeddings mislukt (alleen trefwoordzoeken actief): ${embedError}` : null}
               where id = ${documentId}`;
    });
    return { chunks: chunks.length, embedded: Boolean(embedded) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await withTenant(ctx, (tx) => tx`update documents set status = 'failed', error = ${message.slice(0, 500)} where id = ${documentId}`);
    throw err;
  }
}
