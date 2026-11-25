// Outbound fetch for user-supplied URLs with SSRF protection, size and time limits.
import dns from "node:dns/promises";
import net from "node:net";

const UA = "AdStudioBot/1.0 (+product-ad-generator; respects robots.txt)";

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("Only http(s) URLs are allowed");
  if (u.username || u.password) throw new Error("Credentials in URLs are not allowed");
  // Explicit allow-list for local staging shops / tests (off by default), e.g. SCRAPER_ALLOW_HOSTS=localhost:4010
  const allow = (process.env.SCRAPER_ALLOW_HOSTS || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (allow.includes(u.host)) return u;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("Private hosts are not allowed");
  let addrs: { address: string }[];
  try {
    addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  } catch (e) {
    // Behind an egress proxy that resolves names itself (NODE_USE_ENV_PROXY=1 + HTTPS_PROXY),
    // local DNS may be unavailable; the proxy then enforces egress policy.
    if (process.env.NODE_USE_ENV_PROXY === "1" && process.env.HTTPS_PROXY) return u;
    throw e;
  }
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error("URL resolves to a private network address");
  return u;
}

export async function safeFetch(raw: string, opts: { maxBytes?: number; timeoutMs?: number; accept?: string; headers?: Record<string, string> } = {}): Promise<{ url: string; status: number; contentType: string; body: Buffer }> {
  const maxBytes = opts.maxBytes ?? 8 * 1024 * 1024;
  let url = raw;
  for (let hop = 0; hop < 5; hop++) {
    await assertPublicUrl(url);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15000);
    try {
      const r = await fetch(url, { redirect: "manual", signal: ctrl.signal, headers: { "User-Agent": UA, Accept: opts.accept ?? "*/*", ...(opts.headers ?? {}) } });
      if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
        url = new URL(r.headers.get("location")!, url).toString();
        continue;
      }
      const len = Number(r.headers.get("content-length") || 0);
      if (len > maxBytes) throw new Error(`Response too large (${len} bytes)`);
      const reader = r.body?.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > maxBytes) {
            ctrl.abort();
            throw new Error("Response too large");
          }
          chunks.push(value);
        }
      }
      return { url, status: r.status, contentType: r.headers.get("content-type") || "", body: Buffer.concat(chunks) };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("Too many redirects");
}

/** Minimal robots.txt check for our user agent (and *). */
export async function robotsAllows(target: URL): Promise<boolean> {
  try {
    const r = await safeFetch(`${target.origin}/robots.txt`, { maxBytes: 512 * 1024, timeoutMs: 6000 });
    if (r.status >= 400) return true;
    const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
    let cur: (typeof groups)[number] | null = null;
    for (const raw of r.body.toString("utf8").split(/\r?\n/)) {
      const m = raw.replace(/#.*/, "").trim().match(/^([a-z-]+)\s*:\s*(.*)$/i);
      if (!m) continue;
      const k = m[1].toLowerCase();
      const v = m[2].trim();
      if (k === "user-agent") {
        if (!cur || cur.rules.length) groups.push((cur = { agents: [], rules: [] }));
        cur.agents.push(v.toLowerCase());
      } else if (cur && (k === "disallow" || k === "allow") && v) {
        cur.rules.push({ allow: k === "allow", path: v });
      }
    }
    const own = groups.filter((g) => g.agents.some((a) => a.includes("adstudiobot")));
    const rules = (own.length ? own : groups.filter((g) => g.agents.includes("*"))).flatMap((g) => g.rules);
    const p = target.pathname + target.search;
    let best: { allow: boolean; path: string } | null = null;
    for (const rule of rules) {
      const pattern = new RegExp("^" + rule.path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
      if (pattern.test(p) && (!best || rule.path.length > best.path.length)) best = rule;
    }
    return best ? best.allow : true;
  } catch {
    return true;
  }
}
