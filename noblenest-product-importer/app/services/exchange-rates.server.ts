/**
 * Haalt ECB-referentiekoersen op (maximaal elke 12 uur), bewaart ze per winkel en combineert
 * ze met handmatige koersen. Bij een storing wordt de laatst bekende koers gebruikt en gemeld.
 */
import db from "../db.server";
import { ECB_DAILY_URL, mergeRates, parseEcbXml, type ExchangeRateTable } from "../lib/pricing/exchange-rates";
import { getSetting } from "./settings.server";

const CACHE_KEY = "pricing.exchangeRates.ecbCache";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

interface EcbCache {
  date: string;
  rates: Record<string, number>;
  fetchedAt: string;
}

export interface ExchangeRateResult extends ExchangeRateTable {
  warning: string | null;
}

export async function getExchangeRates(
  shopId: string,
  fetchImpl: typeof fetch = fetch,
  now = new Date(),
): Promise<ExchangeRateResult> {
  const { manualRates } = await getSetting(shopId, "pricing.exchangeRates");
  const cacheRow = await db.appSetting.findUnique({ where: { shopId_key: { shopId, key: CACHE_KEY } } });
  const cache = (cacheRow?.value ?? null) as EcbCache | null;
  const fresh = cache && now.getTime() - new Date(cache.fetchedAt).getTime() < MAX_AGE_MS;

  if (fresh) return { ...mergeRates(cache, manualRates, new Date(cache.fetchedAt)), warning: null };

  try {
    const response = await fetchImpl(ECB_DAILY_URL, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parsed = parseEcbXml(await response.text());
    const value: EcbCache = { ...parsed, fetchedAt: now.toISOString() };
    await db.appSetting.upsert({
      where: { shopId_key: { shopId, key: CACHE_KEY } },
      create: { shopId, key: CACHE_KEY, value: value as object },
      update: { value: value as object },
    });
    return { ...mergeRates(parsed, manualRates, now), warning: null };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (cache) {
      return {
        ...mergeRates(cache, manualRates, new Date(cache.fetchedAt)),
        warning: `ECB-koersen konden niet worden vernieuwd (${reason}); koersen van ${cache.date} worden gebruikt.`,
      };
    }
    return {
      ...mergeRates(null, manualRates, now),
      warning: `ECB-koersen niet beschikbaar (${reason}). Alleen handmatige koersen worden gebruikt.`,
    };
  }
}
