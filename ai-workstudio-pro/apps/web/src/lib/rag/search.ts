import { withTenant, type TenantContext } from "@/lib/db";
import { embedTexts } from "@/lib/ai/service";
import { toVectorLiteral } from "@/lib/rag/ingest";
import { roleRank, type OrgRole } from "@/lib/auth/rbac";
import { UNTRUSTED_DATA_POLICY, detectInjection, wrapUntrusted } from "@/lib/security/injection";

export interface SearchHit {
  chunkId: string;
  documentId: string;
  knowledgeBaseId: string;
  title: string;
  page: number | null;
  chunkIndex: number;
  content: string;
  score: number;
  vectorSimilarity: number | null;
  keywordRank: number | null;
}

export interface Citation {
  n: number;
  documentId: string;
  title: string;
  page: number | null;
  chunkIndex: number;
  excerpt: string;
}

const MIN_SIMILARITY = 0.3;

function orQuery(q: string): string | null {
  const words = q
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 16);
  return words.length ? words.join(" | ") : null;
}

/**
 * Hybride zoeken: pgvector (cosine) + PostgreSQL full-text (Nederlands), samengevoegd met
 * Reciprocal Rank Fusion. Alleen relevante treffers worden teruggegeven, zodat de AI kan
 * aangeven dat informatie ontbreekt in plaats van iets te verzinnen.
 * Toegangsrechten: RLS (rol van de gebruiker) + optioneel de clearance van een agent.
 */
export async function searchKnowledge(
  ctx: TenantContext,
  opts: { query: string; knowledgeBaseIds?: string[]; topK?: number; maxRole?: OrgRole },
): Promise<SearchHit[]> {
  const topK = Math.min(Math.max(opts.topK ?? 5, 1), 10);
  const kbFilter = opts.knowledgeBaseIds?.length ? opts.knowledgeBaseIds : null;
  const maxRank = opts.maxRole ? roleRank(opts.maxRole) : 100;
  const query = opts.query.trim().slice(0, 1000);
  if (!query) return [];

  const { keyword, models } = await withTenant(ctx, async (tx) => {
    const tsq = orQuery(query);
    const keyword = tsq
      ? await tx<{ id: string; rank: number }[]>`
          select c.id, ts_rank_cd(c.tsv, to_tsquery('dutch', ${tsq})) as rank
            from document_chunks c
           where c.tsv @@ to_tsquery('dutch', ${tsq})
             and (${kbFilter}::uuid[] is null or c.knowledge_base_id = any(${kbFilter}::uuid[]))
             and app_role_rank(c.min_role) <= ${maxRank}
           order by rank desc limit 20`
      : [];
    const models = await tx<{ id: string; embedding_provider: string; embedding_model: string }[]>`
      select id, embedding_provider, embedding_model from knowledge_bases
       where embedding_model is not null and (${kbFilter}::uuid[] is null or id = any(${kbFilter}::uuid[]))`;
    return { keyword, models };
  });

  // Vector search per embeddingmodel.
  const vector: { id: string; similarity: number }[] = [];
  const groups = new Map<string, { provider: string; model: string; kbIds: string[] }>();
  for (const m of models) {
    const key = `${m.embedding_provider}:${m.embedding_model}`;
    if (!groups.has(key)) groups.set(key, { provider: m.embedding_provider, model: m.embedding_model, kbIds: [] });
    groups.get(key)!.kbIds.push(m.id);
  }
  for (const g of groups.values()) {
    try {
      const emb = await embedTexts(ctx, [query], { provider: g.provider, model: g.model });
      if (!emb) continue;
      const vec = toVectorLiteral(emb.vectors[0]);
      const rows = await withTenant(ctx, (tx) => tx<{ id: string; similarity: number }[]>`
        select c.id, 1 - (c.embedding <=> ${vec}::vector) as similarity
          from document_chunks c
         where c.embedding is not null and c.knowledge_base_id = any(${g.kbIds}::uuid[])
           and app_role_rank(c.min_role) <= ${maxRank}
         order by c.embedding <=> ${vec}::vector limit 20`);
      vector.push(...rows.map((r) => ({ id: r.id, similarity: Number(r.similarity) })));
    } catch {
      /* embedding niet beschikbaar: alleen trefwoordzoeken */
    }
  }

  const scores = new Map<string, { score: number; sim: number | null; kw: number | null }>();
  keyword.forEach((r, i) => scores.set(r.id, { score: 1 / (60 + i), sim: null, kw: Number(r.rank) }));
  vector
    .sort((a, b) => b.similarity - a.similarity)
    .forEach((r, i) => {
      if (r.similarity < MIN_SIMILARITY) return;
      const cur = scores.get(r.id) ?? { score: 0, sim: null, kw: null };
      cur.score += 1 / (60 + i);
      cur.sim = r.similarity;
      scores.set(r.id, cur);
    });
  const ranked = [...scores.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, topK);
  if (!ranked.length) return [];

  const ids = ranked.map(([id]) => id);
  const rows = await withTenant(ctx, (tx) => tx<{ id: string; document_id: string; knowledge_base_id: string; title: string; chunk_index: number; content: string; metadata: { page?: number | null } }[]>`
    select c.id, c.document_id, c.knowledge_base_id, d.title, c.chunk_index, c.content, c.metadata
      from document_chunks c join documents d on d.id = c.document_id
     where c.id = any(${ids}::uuid[])`);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ranked
    .map(([id, s]) => {
      const r = byId.get(id);
      if (!r) return null;
      return {
        chunkId: id,
        documentId: r.document_id,
        knowledgeBaseId: r.knowledge_base_id,
        title: r.title,
        page: r.metadata?.page ?? null,
        chunkIndex: r.chunk_index,
        content: r.content,
        score: s.score,
        vectorSimilarity: s.sim,
        keywordRank: s.kw,
      } satisfies SearchHit;
    })
    .filter((x): x is SearchHit => x !== null);
}

/** Bouwt de contextsectie voor het model plus citaties voor de interface. */
export function buildKnowledgeContext(hits: SearchHit[]): { context: string; citations: Citation[]; injectionFlags: string[] } {
  const citations: Citation[] = hits.map((h, i) => ({
    n: i + 1,
    documentId: h.documentId,
    title: h.title,
    page: h.page,
    chunkIndex: h.chunkIndex,
    excerpt: h.content.slice(0, 400),
  }));
  const flags = new Set<string>();
  hits.forEach((h) => detectInjection(h.content).forEach((f) => flags.add(f)));
  const body = hits.length
    ? hits.map((h, i) => `[Bron ${i + 1}] ${h.title}${h.page ? `, p. ${h.page}` : ""}\n${wrapUntrusted(`BRON ${i + 1}`, h.content)}`).join("\n\n")
    : "(Er zijn geen relevante fragmenten gevonden in de kennisbank.)";
  const context = [
    "## Kennisbank",
    "Gebruik voor bedrijfsspecifieke informatie uitsluitend de onderstaande bronnen.",
    "- Verwijs naar bronnen met [Bron n].",
    "- Staat het antwoord niet in de bronnen? Zeg dan expliciet: \"Deze informatie staat niet in de kennisbank.\" Verzin nooit bedrijfsinformatie (prijzen, namen, afspraken, cijfers).",
    UNTRUSTED_DATA_POLICY,
    "",
    body,
  ].join("\n");
  return { context, citations, injectionFlags: [...flags] };
}
