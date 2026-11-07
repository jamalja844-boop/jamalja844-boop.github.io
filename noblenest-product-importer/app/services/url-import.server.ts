/**
 * "Product importeren via URL".
 *
 * Een productlink leidt alleen tot een import als hij bij een toegestane bron hoort:
 * 1. het product staat in een gekoppelde feedbron (bron-URL komt overeen) → voorbeeld van dat product;
 * 2. de link wijst naar een feedbestand (.xml/.json) → eenmalig veilig ophalen en inlezen;
 * 3. marktplaatsen (AliExpress, Alibaba, Temu) → uitleg over de officiële koppeling;
 * 4. anders → uitleg; er wordt niets van de pagina opgehaald.
 */
import { normalizeUrl } from "../lib/import/duplicates";
import { classifyMarketplace, feedFormatFromUrl, UNSUPPORTED_URL_MESSAGE } from "../lib/import/url-sources";
import { assertSafeUrl, displayUrl, safeFetchText, SafeFetchError, type SafeFetchOptions } from "../lib/security/safe-fetch.server";
import { createPreview, type ShopRef } from "./import.server";
import { getFeedCatalog, listFeedSources } from "./feed-sources.server";
import { logAudit } from "./audit.server";

export type UrlImportResult =
  | { kind: "PREVIEW"; jobId: string; message: string }
  | { kind: "INFO"; tone: "info" | "warning" | "critical"; message: string };

const MAX_SOURCES_TO_SEARCH = 10;

export async function importFromUrl(
  shop: ShopRef,
  userId: string | null,
  rawUrl: string,
  options: { fetchOptions?: Pick<SafeFetchOptions, "fetchImpl" | "resolver" | "timeoutMs">; ecbFetch?: typeof fetch } = {},
): Promise<UrlImportResult> {
  let url: URL;
  try {
    url = assertSafeUrl(rawUrl);
  } catch (error) {
    return { kind: "INFO", tone: "critical", message: error instanceof Error ? error.message : "Ongeldige URL." };
  }
  const defaultCurrency = shop.currencyCode ?? "EUR";

  const marketplace = classifyMarketplace(url.hostname);
  if (marketplace) {
    await logAudit({ shopId: shop.id, actorUserId: userId, action: "import.url.marketplace", level: "INFO", message: `Link van ${marketplace.name} herkend: ${displayUrl(url.toString())}.` });
    return { kind: "INFO", tone: "warning", message: `${marketplace.name}: ${marketplace.message}` };
  }

  // 1. Staat dit product in een gekoppelde feed?
  const wanted = normalizeUrl(url.toString());
  const sources = (await listFeedSources(shop.id)).slice(0, MAX_SOURCES_TO_SEARCH);
  for (const source of sources) {
    try {
      const { parsed, config } = await getFeedCatalog(shop.id, source.id, { defaultCurrency, fetchOptions: options.fetchOptions });
      const match = parsed.products.find((p) => p.sourceUrl && normalizeUrl(p.sourceUrl) === wanted);
      if (match) {
        const { job } = await createPreview({
          shop,
          userId,
          sourceName: `URL: ${match.title}`,
          format: config.format,
          parsed,
          onlyExternalIds: [match.externalId],
          jobType: "URL",
          fetchImpl: options.ecbFetch,
        });
        return { kind: "PREVIEW", jobId: job.id, message: `Gevonden in feed "${source.name}".` };
      }
    } catch {
      // Een onbereikbare feed slaan we over; de status staat bij de feedbron.
    }
  }

  // 2. Link naar een feedbestand: eenmalig veilig ophalen.
  const format = feedFormatFromUrl(url);
  if (format) {
    try {
      const fetched = await safeFetchText(url.toString(), { maxBytes: Number(process.env.NOBLENEST_MAX_FEED_MB ?? 20) * 1024 * 1024, ...options.fetchOptions });
      const { job } = await createPreview({
        shop,
        userId,
        sourceName: `Feed-URL: ${displayUrl(url.toString())}`,
        format,
        text: fetched.text,
        jobType: "URL",
        fetchImpl: options.ecbFetch,
      });
      return { kind: "PREVIEW", jobId: job.id, message: "Feed ingelezen." };
    } catch (error) {
      const message = error instanceof SafeFetchError || error instanceof Error ? error.message : String(error);
      return { kind: "INFO", tone: "critical", message: `De feed kon niet worden ingelezen: ${message}` };
    }
  }

  await logAudit({ shopId: shop.id, actorUserId: userId, action: "import.url.unsupported", level: "INFO", message: `Geen toegestane bron voor ${displayUrl(url.toString())}.` });
  return { kind: "INFO", tone: "info", message: UNSUPPORTED_URL_MESSAGE };
}
