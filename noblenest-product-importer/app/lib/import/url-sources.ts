/**
 * Herkenning van productlinks. Noblenest haalt nooit gegevens van willekeurige webpagina's op
 * (geen scraping); een link wordt alleen gebruikt als hij bij een toegestane bron hoort.
 */

export interface MarketplaceInfo {
  supplierKey: string;
  name: string;
  message: string;
}

const MARKETPLACES: { pattern: RegExp; info: MarketplaceInfo }[] = [
  {
    pattern: /(^|\.)aliexpress\.(com|us|ru)$/i,
    info: {
      supplierKey: "aliexpress",
      name: "AliExpress",
      message:
        "AliExpress-links kunnen alleen via het officiële AliExpress Open Platform worden uitgelezen. Daarvoor is een goedgekeurd ontwikkelaarsaccount (App Key en App Secret) nodig. Tot die tijd: exporteer de productgegevens als CSV of vraag de leverancier om een productfeed.",
    },
  },
  {
    pattern: /(^|\.)(alibaba\.com|1688\.com)$/i,
    info: {
      supplierKey: "alibaba",
      name: "Alibaba",
      message:
        "Alibaba-links vereisen goedgekeurde API-toegang via Alibaba. Vraag de leverancier om een CSV-export of productfeed.",
    },
  },
  {
    pattern: /(^|\.)temu\.com$/i,
    info: {
      supplierKey: "temu",
      name: "Temu",
      message:
        "Voor Temu is ons geen officiële, toegestane koppeling voor productimport bekend. Productpagina's overnemen (scraping) wordt niet ondersteund.",
    },
  },
];

export function classifyMarketplace(hostname: string): MarketplaceInfo | null {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return MARKETPLACES.find((m) => m.pattern.test(host))?.info ?? null;
}

/** Herkent een link naar een feedbestand aan de extensie van het pad. */
export function feedFormatFromUrl(url: URL): "XML" | "JSON" | null {
  const path = url.pathname.toLowerCase();
  if (path.endsWith(".xml") || path.endsWith(".rss")) return "XML";
  if (path.endsWith(".json")) return "JSON";
  return null;
}

export const UNSUPPORTED_URL_MESSAGE =
  "Voor dit adres is geen toegestane koppeling gevonden. Noblenest haalt geen gegevens van losse webpagina’s op (geen scraping). " +
  "Koppel de productfeed van deze leverancier bij Leveranciers, importeer een CSV-export, of voer het product handmatig in.";
