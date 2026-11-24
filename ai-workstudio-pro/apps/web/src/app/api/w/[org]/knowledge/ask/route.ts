import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { runChat } from "@/lib/ai/service";
import { buildKnowledgeContext, searchKnowledge } from "@/lib/rag/search";

export const maxDuration = 120;

const schema = z.object({
  question: z.string().trim().min(2).max(4000),
  knowledgeBaseIds: z.array(z.string().uuid()).max(20).default([]),
  provider: z.string().max(30).optional(),
  modelId: z.string().max(120).optional(),
  searchOnly: z.boolean().default(false),
});

/** Zoektest en vraag-antwoord op de kennisbank, met bronverwijzingen. */
export const POST = orgHandler({ permission: "knowledge.view", rate: { name: "kb-ask", limit: 30, windowSec: 60 } }, async ({ req, ctx }) => {
  const input = await parseJson(req, schema);
  const hits = await searchKnowledge(ctx.tenant, { query: input.question, knowledgeBaseIds: input.knowledgeBaseIds, topK: 6 });
  const { context, citations, injectionFlags } = buildKnowledgeContext(hits);
  const results = hits.map((h) => ({ title: h.title, page: h.page, documentId: h.documentId, chunkIndex: h.chunkIndex, similarity: h.vectorSimilarity, keywordRank: h.keywordRank, excerpt: h.content.slice(0, 600) }));
  if (input.searchOnly || !input.provider || !input.modelId) return { results, citations, injectionFlags };
  if (!hits.length) {
    return { results, citations, injectionFlags, answer: "Deze informatie staat niet in de kennisbank. Er zijn geen relevante documenten gevonden voor deze vraag.", grounded: false };
  }
  const r = await runChat({
    ctx: ctx.tenant,
    provider: input.provider,
    modelId: input.modelId,
    source: "chat",
    refType: "knowledge_ask",
    request: {
      system: `Je beantwoordt vragen uitsluitend op basis van de kennisbank van ${ctx.org.name}. Antwoord in het Nederlands.\n\n${context}`,
      messages: [{ role: "user", content: input.question }],
      maxTokens: 4000,
      effort: "low",
    },
  });
  return { results, citations, injectionFlags, answer: r.text, grounded: true, costUsd: r.costUsd, provider: r.provider };
});
