import { lookup } from "node:dns/promises";
import net from "node:net";

/** Blokkeert interne/privé-adressen (SSRF-bescherming) voor uitgaande verzoeken van tools. */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 || a === 127 || a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  const lower = ip.toLowerCase();
  if (lower.startsWith("::ffff:")) return isPrivateIp(lower.slice(7));
  return lower === "::1" || lower === "::" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80");
}

export function hostMatches(host: string, allowed: string[]): boolean {
  const h = host.toLowerCase();
  return allowed.some((d) => {
    const domain = d.toLowerCase().replace(/^\*\./, "").trim();
    return domain && (h === domain || h.endsWith(`.${domain}`));
  });
}

/** Valideert een URL voor uitgaand gebruik: alleen https, toegestaan domein, geen privé-IP. */
export async function assertSafeUrl(rawUrl: string, allowedDomains?: string[]): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Ongeldige URL");
  }
  if (url.protocol !== "https:") throw new Error("Alleen https-URL's zijn toegestaan");
  if (url.username || url.password) throw new Error("URL's met inloggegevens zijn niet toegestaan");
  if (allowedDomains && !hostMatches(url.hostname, allowedDomains)) {
    throw new Error(`Domein ${url.hostname} staat niet op de lijst met toegestane domeinen van deze tool`);
  }
  if (net.isIP(url.hostname)) {
    if (isPrivateIp(url.hostname)) throw new Error("Verzoeken naar interne adressen zijn geblokkeerd");
  } else {
    if (/^(localhost|.*\.local|.*\.internal)$/i.test(url.hostname)) throw new Error("Verzoeken naar interne hosts zijn geblokkeerd");
    const addrs = await lookup(url.hostname, { all: true }).catch(() => []);
    if (addrs.some((a) => isPrivateIp(a.address))) throw new Error("Domein verwijst naar een intern adres; geblokkeerd");
  }
  return url;
}
