/**
 * Handmatige Shopify-collecties ophalen (slimme collecties vullen zichzelf via regels en
 * kunnen geen producten handmatig krijgen). Kort gecachet per winkel.
 */
import { runGraphql, type AdminGraphqlClient } from "./graphql.server";

export const CUSTOM_COLLECTIONS_QUERY = `#graphql
  query NoblenestCustomCollections($after: String) {
    collections(first: 250, after: $after, query: "collection_type:custom", sortKey: TITLE) {
      nodes {
        id
        title
        handle
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export interface CollectionOption {
  id: string;
  title: string;
}

interface CollectionsResponse {
  collections: { nodes: { id: string; title: string; handle: string }[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
}

const cache = new Map<string, { at: number; collections: CollectionOption[] }>();
const TTL_MS = 5 * 60 * 1000;
const MAX_PAGES = 4;

export async function getCustomCollections(shopId: string, client: AdminGraphqlClient): Promise<{ collections: CollectionOption[]; error: string | null }> {
  const cached = cache.get(shopId);
  if (cached && Date.now() - cached.at < TTL_MS) return { collections: cached.collections, error: null };

  const collections: CollectionOption[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result: Awaited<ReturnType<typeof runGraphql<CollectionsResponse>>> = await runGraphql<CollectionsResponse>(client, CUSTOM_COLLECTIONS_QUERY, { after });
    if (result.errors.length || !result.data) {
      return { collections, error: `Collecties konden niet worden geladen: ${result.errors.join("; ") || "onbekende fout"}` };
    }
    collections.push(...result.data.collections.nodes.map((c) => ({ id: c.id, title: c.title })));
    if (!result.data.collections.pageInfo.hasNextPage) break;
    after = result.data.collections.pageInfo.endCursor;
  }
  cache.set(shopId, { at: Date.now(), collections });
  return { collections, error: null };
}

export function clearCollectionsCache() {
  cache.clear();
}
