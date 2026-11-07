/**
 * Wisselkoersen van de Europese Centrale Bank (ECB-referentiekoersen).
 * Bron: https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml
 * Notatie: 1 EUR = rate × valuta.
 */

export const ECB_DAILY_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

export interface ExchangeRateTable {
  source: "ECB" | "MANUAL" | "ECB+MANUAL";
  date: string | null;
  rates: Record<string, number>;
  fetchedAt: string;
}

/** Leest het ECB-XML-bestand. Gooit een fout als het formaat onverwacht is. */
export function parseEcbXml(xml: string): { date: string; rates: Record<string, number> } {
  const dateMatch = xml.match(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]/);
  if (!dateMatch) throw new Error("ECB-bestand bevat geen datum.");
  const rates: Record<string, number> = {};
  const re = /<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([0-9.]+)['"]\s*\/>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    const rate = Number(match[2]);
    if (Number.isFinite(rate) && rate > 0) rates[match[1]!] = rate;
  }
  if (Object.keys(rates).length === 0) throw new Error("ECB-bestand bevat geen koersen.");
  return { date: dateMatch[1]!, rates };
}

/** Handmatige koersen hebben voorrang op ECB-koersen. */
export function mergeRates(
  ecb: { date: string; rates: Record<string, number> } | null,
  manual: Record<string, number>,
  now = new Date(),
): ExchangeRateTable {
  const cleanManual = Object.fromEntries(
    Object.entries(manual)
      .map(([k, v]) => [k.toUpperCase(), Number(v)] as const)
      .filter(([k, v]) => /^[A-Z]{3}$/.test(k) && Number.isFinite(v) && v > 0),
  );
  const hasManual = Object.keys(cleanManual).length > 0;
  return {
    source: ecb ? (hasManual ? "ECB+MANUAL" : "ECB") : "MANUAL",
    date: ecb?.date ?? null,
    rates: { ...(ecb?.rates ?? {}), ...cleanManual },
    fetchedAt: now.toISOString(),
  };
}
