/** Hulpfuncties om ruwe bronwaarden (CSV, feeds) veilig om te zetten. */
import { Decimal } from "decimal.js";

export class ValueError extends Error {}

/**
 * Leest een bedrag of getal in Nederlandse of internationale notatie:
 * "12,50", "1.234,56", "1,234.56", "€ 12,50", "12.5". Lege waarde → null.
 * Geeft een string met punt als decimaalteken terug (geschikt voor Decimal/Shopify).
 */
export function parseDecimal(input: string | undefined | null, field: string): string | null {
  if (input === undefined || input === null) return null;
  let s = input.trim();
  if (s === "") return null;
  s = s.replace(/[€$£¥\s]|EUR|USD|GBP|CNY/gi, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma > -1) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new ValueError(`${field}: "${input}" is geen geldig getal`);
  const d = new Decimal(s);
  if (d.isNegative()) throw new ValueError(`${field}: negatieve waarde niet toegestaan`);
  return d.toString();
}

export function parseInteger(input: string | undefined | null, field: string): number | null {
  const d = parseDecimal(input, field);
  if (d === null) return null;
  if (!/^\d+$/.test(d)) throw new ValueError(`${field}: "${input}" is geen geheel getal`);
  const n = Number(d);
  if (!Number.isSafeInteger(n)) throw new ValueError(`${field}: getal te groot`);
  return n;
}

const TRUE_VALUES = new Set(["1", "ja", "j", "yes", "y", "true", "waar", "x"]);
const FALSE_VALUES = new Set(["0", "nee", "n", "no", "false", "onwaar"]);

export function parseBoolean(input: string | undefined | null): boolean | null {
  if (!input) return null;
  const v = input.trim().toLowerCase();
  if (TRUE_VALUES.has(v)) return true;
  if (FALSE_VALUES.has(v)) return false;
  return null;
}

/** Alleen https-URL's naar publieke hosts (geen IP-adressen of lokale namen). */
export function parsePublicHttpsUrl(input: string | undefined | null, field: string): string | null {
  if (!input || input.trim() === "") return null;
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new ValueError(`${field}: "${input}" is geen geldige URL`);
  }
  if (url.protocol !== "https:") throw new ValueError(`${field}: alleen https-adressen zijn toegestaan`);
  if (!isPublicHostname(url.hostname)) throw new ValueError(`${field}: interne of lokale adressen zijn niet toegestaan`);
  if (url.username || url.password) throw new ValueError(`${field}: URL's met inloggegevens zijn niet toegestaan`);
  return url.toString();
}

/** Weigert IP-adressen, localhost en interne domeinnamen (basis-SSRF-bescherming). */
export function isPublicHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "" || h === "localhost" || !h.includes(".")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return false; // IPv4
  if (h.includes(":")) return false; // IPv6
  if (/\.(local|localhost|internal|lan|home|intranet|corp|test|invalid|example)$/.test(h)) return false;
  return true;
}

/** Splitst lijsten op "|", ";" of nieuwe regel (niet op komma: komma's komen voor in URL's/tekst). */
export function splitList(input: string | undefined | null): string[] {
  if (!input) return [];
  return input
    .split(/[|;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Tags: gescheiden door komma, "|" of ";". */
export function splitTags(input: string | undefined | null): string[] {
  if (!input) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of input.split(/[,|;]/)) {
    const tag = raw.trim().slice(0, 255);
    if (tag && !seen.has(tag.toLowerCase())) {
      seen.add(tag.toLowerCase());
      tags.push(tag);
    }
  }
  return tags;
}

export function cleanText(input: string | undefined | null, maxLength?: number): string | null {
  if (input === undefined || input === null) return null;
  const s = input.replace(/\s+/g, " ").trim();
  if (!s) return null;
  return maxLength ? s.slice(0, maxLength) : s;
}
