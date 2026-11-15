'use strict';

const dns = require('node:dns').promises;
const net = require('node:net');

const USER_AGENT = 'CleanLeadzoeker/1.0 (+https://www.cleanschoonmaakbedrijf.nl)';
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 5;
const PAGE_DELAY_MS = 300;

const EMAIL_RE = /[a-z0-9][a-z0-9._+-]*@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;

// Paden waar bedrijven doorgaans hun contactgegevens publiceren, op volgorde van kans.
const CONTACT_HINTS = [
  'contact', 'kontakt', 'over-ons', 'over', 'about', 'team', 'impressum',
  'colofon', 'klantenservice', 'service', 'bedrijf', 'privacy',
];

const GENERIC_LOCAL_PARTS = new Set([
  'info', 'contact', 'sales', 'verkoop', 'administratie', 'admin', 'office',
  'kantoor', 'hello', 'hallo', 'hi', 'mail', 'email', 'post', 'service',
  'klantenservice', 'support', 'helpdesk', 'receptie', 'balie', 'planning',
  'offerte', 'offertes', 'facilitair', 'inkoop', 'hr', 'jobs', 'vacatures',
  'werkenbij', 'welkom', 'algemeen', 'secretariaat', 'boekhouding', 'finance',
  'facturen', 'factuur', 'marketing', 'pr', 'pers', 'team', 'beheer', 'vve',
  'verhuur', 'reserveringen', 'bestellingen', 'orders', 'enquiries',
]);

const IGNORED_LOCAL_PARTS = /^(no-?reply|do-?not-?reply|postmaster|mailer-daemon|abuse|webmaster|hostmaster|privacy|dpo|fg)$/;
const IGNORED_DOMAINS = /(^|\.)(example\.(com|org|nl)|domain\.com|email\.com|sentry\.io|sentry-next\.wixpress\.com|wixpress\.com|w3\.org|schema\.org|godaddy\.com|yourdomain\.com|jouwdomein\.nl|voorbeeld\.nl)$/;
const ASSET_TLDS = /\.(png|jpe?g|gif|webp|svg|avif|css|js|ico|woff2?|ttf|mp4|pdf)$/;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
  }
  const lower = ip.toLowerCase();
  return lower === '::1' || lower === '::' || lower.startsWith('fc') || lower.startsWith('fd') ||
    lower.startsWith('fe80') || lower.startsWith('::ffff:');
}

/** Voorkomt dat de tool wordt gebruikt om het eigen netwerk af te tasten. */
async function assertPublicHost(hostname, allowPrivate) {
  if (allowPrivate) return;
  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error('Intern adres is niet toegestaan');
    return;
  }
  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error('Intern adres is niet toegestaan');
  }
  let records;
  try {
    records = await dns.lookup(hostname, { all: true });
  } catch {
    throw new Error('Website bestaat niet of is onbereikbaar');
  }
  if (records.some((r) => isPrivateAddress(r.address))) {
    throw new Error('Intern adres is niet toegestaan');
  }
}

function normalizeSite(input) {
  let value = String(input || '').trim();
  if (!value) return null;
  if (value.includes('@') && !value.includes('/')) value = value.split('@').pop();
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  try {
    const url = new URL(value);
    if (!url.hostname.includes('.') && url.hostname !== 'localhost' && !net.isIP(url.hostname)) return null;
    return { origin: url.origin, host: url.host.replace(/^www\./, '') };
  } catch {
    return null;
  }
}

async function fetchText(url, { signal, allowPrivate }) {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const target = new URL(current);
    if (!/^https?:$/.test(target.protocol)) throw new Error('Alleen http en https worden ondersteund');
    await assertPublicHost(target.hostname, allowPrivate);

    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const response = await fetch(current, {
      redirect: 'manual',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml,text/plain;q=0.8',
        'accept-language': 'nl,en;q=0.8',
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error('Ongeldige doorverwijzing');
      current = new URL(location, current).href;
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      const error = new Error(`Server antwoordde met status ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const type = response.headers.get('content-type') || '';
    if (type && !/text\/|xhtml|xml/.test(type)) {
      await response.body?.cancel();
      return { url: current, text: '' };
    }

    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    await reader.cancel().catch(() => {});
    return { url: current, text: Buffer.concat(chunks).toString('utf8') };
  }
  throw new Error('Te veel doorverwijzingen');
}

/** Leest de regels voor alle crawlers (User-agent: *) uit robots.txt. */
function parseRobots(text) {
  const disallow = [];
  let applies = false;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const match = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!match) continue;
    const key = match[1].toLowerCase();
    const value = match[2].trim();
    if (key === 'user-agent') {
      if (!lastWasAgent) applies = false;
      if (value === '*') applies = true;
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (key === 'disallow' && applies && value) disallow.push(value);
    }
  }
  return disallow;
}

function isAllowed(pathname, disallow) {
  return !disallow.some((rule) => {
    if (rule === '/') return true;
    const prefix = rule.replace(/\*.*$/, '');
    return prefix.length > 1 && pathname.startsWith(prefix);
  });
}

function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&commat;/gi, '@')
    .replace(/&period;/gi, '.')
    .replace(/&amp;/gi, '&');
}

function decodeCloudflare(hex) {
  const key = parseInt(hex.slice(0, 2), 16);
  let out = '';
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  return out;
}

function extractEmails(html) {
  let text = decodeEntities(html);
  text = text.replace(/data-cfemail="([0-9a-f]+)"/gi, (_, hex) => ` ${decodeCloudflare(hex)} `);
  try {
    text = text.replace(/mailto:([^"'?\s>]+)/gi, (_, addr) => ` ${decodeURIComponent(addr)} `);
  } catch { /* ongeldige codering: de gewone tekstscan vangt het adres alsnog op */ }
  text = text
    .replace(/\s*[\[({]\s*(?:at|apenstaartje)\s*[\])}]\s*/gi, '@')
    .replace(/\s*[\[({]\s*(?:dot|punt)\s*[\])}]\s*/gi, '.')
    .replace(/%20|\\u003[ce]|u003[ce]/gi, ' ');

  const found = new Set();
  for (const match of text.matchAll(EMAIL_RE)) {
    const email = match[0].toLowerCase().replace(/\.+$/, '');
    const [local, domain] = email.split('@');
    if (email.length > 100 || local.length > 64) continue;
    if (ASSET_TLDS.test(domain) || IGNORED_DOMAINS.test(domain)) continue;
    if (IGNORED_LOCAL_PARTS.test(local)) continue;
    if (/^[0-9a-f]{16,}$/.test(local)) continue; // tracking-id's, geen postvak
    found.add(email);
  }
  return [...found];
}

function classify(email) {
  const local = email.split('@')[0];
  return GENERIC_LOCAL_PARTS.has(local) ? 'algemeen' : 'persoonlijk';
}

function findContactLinks(html, pageUrl, host) {
  const scored = new Map();
  for (const match of html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"'#]+)["']/gi)) {
    let url;
    try {
      url = new URL(decodeEntities(match[1]), pageUrl);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(url.protocol)) continue;
    if (url.host.replace(/^www\./, '') !== host) continue;
    if (ASSET_TLDS.test(url.pathname)) continue;
    const path = url.pathname.toLowerCase();
    const index = CONTACT_HINTS.findIndex((hint) => path.includes(hint));
    if (index === -1) continue;
    url.hash = '';
    url.search = '';
    const score = index * 10 + path.split('/').length;
    if (!scored.has(url.href) || scored.get(url.href) > score) scored.set(url.href, score);
  }
  return [...scored.entries()].sort((a, b) => a[1] - b[1]).map(([href]) => href);
}

const mxCache = new Map();
async function hasMailServer(domain) {
  if (!mxCache.has(domain)) {
    mxCache.set(domain, dns.resolveMx(domain).then((r) => r.length > 0, () => false));
  }
  return mxCache.get(domain);
}

/**
 * Doorzoekt één website: startpagina plus de meest kansrijke contactpagina's.
 * Geeft { site, status, pages, emails: [{ email, type, source, mx }] } terug.
 */
async function scanSite(input, options = {}) {
  const { maxPages = 5, genericOnly = true, checkMx = true, signal, allowPrivate = false } = options;
  const site = normalizeSite(input);
  if (!site) return { site: String(input).trim(), status: 'ongeldig', message: 'Geen geldig webadres', pages: 0, emails: [] };

  const result = { site: site.host, status: 'ok', message: '', pages: 0, emails: [] };
  const fetchOptions = { signal, allowPrivate };

  let disallow = [];
  try {
    const robots = await fetchText(`${site.origin}/robots.txt`, fetchOptions);
    disallow = parseRobots(robots.text);
  } catch { /* geen robots.txt: alles is toegestaan */ }

  const queue = [`${site.origin}/`];
  const visited = new Set();
  const seen = new Map();
  let blocked = 0;
  let lastError = '';

  while (queue.length && visited.size < maxPages) {
    if (signal?.aborted) break;
    const pageUrl = queue.shift();
    if (visited.has(pageUrl)) continue;
    visited.add(pageUrl);

    if (!isAllowed(new URL(pageUrl).pathname, disallow)) {
      blocked += 1;
      continue;
    }
    if (result.pages > 0) await sleep(PAGE_DELAY_MS);

    let page;
    try {
      page = await fetchText(pageUrl, fetchOptions);
    } catch (error) {
      lastError = error.name === 'TimeoutError' ? 'Website reageert niet op tijd'
        : error.message === 'fetch failed' ? 'Website is onbereikbaar' : error.message;
      if (result.pages === 0 && pageUrl.startsWith('https://') && visited.size === 1 && !error.status) {
        const fallback = pageUrl.replace('https://', 'http://');
        queue.unshift(fallback);
        visited.delete(fallback);
      }
      continue;
    }
    result.pages += 1;

    for (const email of extractEmails(page.text)) {
      if (!seen.has(email)) seen.set(email, new URL(page.url).pathname);
    }
    if (result.pages === 1) {
      for (const link of findContactLinks(page.text, page.url, site.host)) {
        if (!visited.has(link) && !queue.includes(link)) queue.push(link);
      }
    }
  }

  if (result.pages === 0) {
    result.status = blocked ? 'geblokkeerd' : 'fout';
    result.message = blocked ? 'Website staat geen crawlers toe (robots.txt)' : lastError || 'Website is onbereikbaar';
    return result;
  }

  for (const [email, source] of seen) {
    const type = classify(email);
    if (genericOnly && type !== 'algemeen') continue;
    const mx = checkMx ? await hasMailServer(email.split('@')[1]) : null;
    result.emails.push({ email, type, source, mx });
  }
  result.emails.sort((a, b) => (a.type === b.type ? a.email.localeCompare(b.email) : a.type === 'algemeen' ? -1 : 1));
  if (!result.emails.length) {
    result.status = 'leeg';
    result.message = seen.size ? 'Alleen persoonlijke adressen gevonden' : 'Geen e-mailadres gepubliceerd';
  }
  return result;
}

module.exports = { scanSite, extractEmails, classify, parseRobots, isAllowed, normalizeSite, findContactLinks };
