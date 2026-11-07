/**
 * Veilig ophalen van externe feeds (SSRF-bescherming).
 *
 * - Alleen https naar publieke hostnamen (geen IP-adressen, localhost of interne domeinen).
 * - Het IP-adres wordt gecontroleerd OP HET MOMENT VAN VERBINDEN (eigen DNS-lookup in de
 *   undici-dispatcher). Zo werkt ook DNS-rebinding niet: een naam die naar een intern adres
 *   wijst, wordt altijd geweigerd — ook na een redirect.
 * - Redirects worden handmatig gevolgd (max. 3) en elke stap opnieuw gecontroleerd.
 * - Maximale grootte en tijd; de body wordt in stukjes gelezen en afgebroken boven de limiet.
 */
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";
import { isPublicHostname } from "../import/values";

export class SafeFetchError extends Error {}

const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];

function v4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

/** true voor privé-, loopback-, link-local-, gereserveerde en documentatieadressen. */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const n = v4ToInt(address);
    return V4_BLOCKED.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (v4ToInt(base) & mask);
    });
  }
  if (family === 6) {
    const a = address.toLowerCase();
    if (a === "::" || a === "::1") return true;
    const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedAddress(mapped[1]!);
    if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(a)) return true; // v4-mapped in hex-notatie
    const first = parseInt(a.split(":")[0] || "0", 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
    if (a.startsWith("2001:db8:") || a.startsWith("64:ff9b:") || a.startsWith("100::")) return true;
    return false;
  }
  return true; // geen geldig IP → weigeren
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;
type LookupFn = (hostname: string, options: { all?: boolean; family?: number }, callback: LookupCallback) => void;

/** DNS-lookup die geblokkeerde adressen weigert. Wordt gebruikt bij elke nieuwe verbinding. */
export function createGuardedLookup(resolver: typeof dnsLookup = dnsLookup): LookupFn {
  return (hostname, options, callback) => {
    resolver(hostname, { all: true, family: options?.family ?? 0 }, (err, addresses) => {
      if (err) return callback(err, []);
      const list = addresses as LookupAddress[];
      if (list.length === 0) return callback(new SafeFetchError(`Geen adres gevonden voor ${hostname}`) as NodeJS.ErrnoException, []);
      const blocked = list.find((a) => isBlockedAddress(a.address));
      if (blocked) {
        return callback(new SafeFetchError(`Toegang tot intern of gereserveerd adres geweigerd (${hostname}).`) as NodeJS.ErrnoException, []);
      }
      if (options?.all) return callback(null, list);
      return callback(null, list[0]!.address, list[0]!.family);
    });
  };
}

export function assertSafeUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new SafeFetchError("Ongeldige URL.");
  }
  if (url.protocol !== "https:") throw new SafeFetchError("Alleen https-adressen zijn toegestaan.");
  if (url.username || url.password) throw new SafeFetchError("URL's met inloggegevens zijn niet toegestaan.");
  if (!isPublicHostname(url.hostname)) throw new SafeFetchError("Interne of lokale adressen zijn niet toegestaan.");
  if (url.port && url.port !== "443") throw new SafeFetchError("Alleen de standaard https-poort (443) is toegestaan.");
  return url;
}

export interface SafeFetchOptions {
  maxBytes: number;
  timeoutMs?: number;
  maxRedirects?: number;
  /** Alleen voor tests: vervangt de netwerklaag. */
  fetchImpl?: (url: string, init: { redirect: "manual"; signal: AbortSignal; headers: Record<string, string> }) => Promise<Response>;
  /** Alleen voor tests: vervangt de DNS-resolver (de echte undici-verbinding blijft in gebruik). */
  resolver?: typeof dnsLookup;
}

function findSafeFetchError(error: unknown): SafeFetchError | null {
  let current: unknown = error;
  for (let depth = 0; current && depth < 6; depth++) {
    if (current instanceof SafeFetchError) return current;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

const ALLOWED_TYPES = /^(application\/(xml|rss\+xml|atom\+xml|json|octet-stream)|text\/(xml|plain|csv)|$)/i;

export function createSafeAgent(resolver?: typeof dnsLookup): Agent {
  return new Agent({ connect: { lookup: createGuardedLookup(resolver) as never, timeout: 10_000 } });
}

let sharedAgent: Agent | null = null;
function agent(resolver?: typeof dnsLookup): Agent {
  if (resolver) return createSafeAgent(resolver);
  sharedAgent ??= createSafeAgent();
  return sharedAgent;
}

export async function safeFetchText(rawUrl: string, options: SafeFetchOptions): Promise<{ text: string; finalUrl: string; contentType: string }> {
  const timeoutMs = options.timeoutMs ?? 20_000;
  const maxRedirects = options.maxRedirects ?? 3;
  const signal = AbortSignal.timeout(timeoutMs);
  const doFetch =
    options.fetchImpl ??
    ((url: string, init: { redirect: "manual"; signal: AbortSignal; headers: Record<string, string> }) =>
      undiciFetch(url, { ...init, dispatcher: agent(options.resolver) }) as unknown as Promise<Response>);

  let url = assertSafeUrl(rawUrl);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    let response: Response;
    try {
      response = await doFetch(url.toString(), {
        redirect: "manual",
        signal,
        headers: { Accept: "application/xml, application/rss+xml, application/json, text/csv;q=0.9, */*;q=0.5", "User-Agent": "Noblenest/0.3 (+productfeed)" },
      });
    } catch (error) {
      const blocked = findSafeFetchError(error);
      if (blocked) throw blocked;
      if ((error as Error)?.name === "TimeoutError" || signal.aborted) throw new SafeFetchError(`Time-out na ${Math.round(timeoutMs / 1000)} seconden.`);
      throw new SafeFetchError(`Feed niet bereikbaar: ${describeNetworkError(error, url.hostname)}`);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new SafeFetchError("Doorverwijzing zonder adres.");
      url = assertSafeUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new SafeFetchError(`De feed gaf HTTP ${response.status}.`);

    const contentType = (response.headers.get("content-type") ?? "").split(";")[0]!.trim();
    if (!ALLOWED_TYPES.test(contentType)) throw new SafeFetchError(`Onverwacht bestandstype: ${contentType}.`);
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > options.maxBytes) throw new SafeFetchError(`De feed is groter dan ${Math.round(options.maxBytes / 1024 / 1024)} MB.`);

    const bytes = await readLimited(response, options.maxBytes);
    if (bytes.includes(0)) throw new SafeFetchError("De feed bevat binaire gegevens.");
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      text = new TextDecoder("windows-1252").decode(bytes);
    }
    return { text, finalUrl: url.toString(), contentType };
  }
  throw new SafeFetchError(`Te veel doorverwijzingen (max. ${maxRedirects}).`);
}

/** Vertaalt netwerkfouten naar begrijpelijke Nederlandse meldingen. */
export function describeNetworkError(error: unknown, hostname: string): string {
  let current: unknown = error;
  for (let depth = 0; current && depth < 6; depth++) {
    const code = (current as { code?: string }).code;
    switch (code) {
      case "ENOTFOUND":
      case "EAI_AGAIN":
        return `domeinnaam ${hostname} niet gevonden.`;
      case "ECONNREFUSED":
        return `${hostname} weigert de verbinding.`;
      case "ECONNRESET":
        return "de verbinding werd onderbroken.";
      case "CERT_HAS_EXPIRED":
      case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
      case "DEPTH_ZERO_SELF_SIGNED_CERT":
      case "ERR_TLS_CERT_ALTNAME_INVALID":
        return `het beveiligingscertificaat van ${hostname} is ongeldig.`;
      case "UND_ERR_CONNECT_TIMEOUT":
        return `geen verbinding met ${hostname} binnen de tijd.`;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return error instanceof Error ? error.message : String(error);
}

async function readLimited(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new SafeFetchError(`De feed is groter dan ${Math.round(maxBytes / 1024 / 1024)} MB.`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/** Toont alleen host en pad (zonder querystring, waarin vaak tokens staan). */
export function displayUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.hostname}${u.pathname.length > 40 ? `${u.pathname.slice(0, 40)}…` : u.pathname}`;
  } catch {
    return "ongeldige URL";
  }
}
