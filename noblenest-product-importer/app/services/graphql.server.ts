/**
 * Dunne laag rond de Shopify Admin GraphQL-client, zodat services testbaar zijn
 * (in tests wordt een nep-client meegegeven) en fouten eenduidig worden afgehandeld.
 */

export type AdminGraphqlClient = (
  query: string,
  options?: { variables?: Record<string, unknown>; tries?: number },
) => Promise<{ json(): Promise<unknown> }>;

export interface GraphqlResult<T> {
  data: T | null;
  /** Fouten op GraphQL-niveau (schema, rechten, throttling) */
  errors: string[];
  /** true als het verzoek Shopify mogelijk niet (volledig) heeft bereikt — uitkomst onbekend */
  transportError: boolean;
}

export async function runGraphql<T>(
  client: AdminGraphqlClient,
  query: string,
  variables?: Record<string, unknown>,
): Promise<GraphqlResult<T>> {
  try {
    const response = await client(query, { variables, tries: 3 });
    const body = (await response.json()) as { data?: T; errors?: unknown };
    return { data: body.data ?? null, errors: extractErrors(body.errors), transportError: false };
  } catch (error) {
    // De Shopify-bibliotheek gooit GraphqlQueryError met de response-body bij GraphQL-fouten.
    const body = (error as { body?: { errors?: unknown } })?.body;
    if (body?.errors) return { data: null, errors: extractErrors(body.errors), transportError: false };
    const message = error instanceof Error ? error.message : String(error);
    return { data: null, errors: [`Verbinding met Shopify mislukt: ${message}`], transportError: true };
  }
}

function extractErrors(errors: unknown): string[] {
  if (!errors) return [];
  if (Array.isArray(errors)) {
    return errors.map((e) => (typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e)));
  }
  if (typeof errors === "object" && errors && "graphQLErrors" in errors) {
    return extractErrors((errors as { graphQLErrors: unknown }).graphQLErrors);
  }
  if (typeof errors === "object" && errors && "message" in errors) return [String((errors as { message: unknown }).message)];
  return [String(errors)];
}
