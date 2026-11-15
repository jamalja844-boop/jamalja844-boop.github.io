'use strict';

const { scanSite, normalizeSite, classify } = require('./scraper');
const { probeDomain } = require('./verifier');

const PREFIXES = new Set(['van', 'de', 'der', 'den', 'het', 'ter', 'ten', 'te', 'op', 'in', "'t", 't', 'la', 'le', 'du', 'von', 'el', 'al']);

const clean = (value) => String(value || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z\s'-]/g, ' ').trim();

/** Splitst "Jan", "van der Berg" in voornaam, tussenvoegsel en kernachternaam. */
function nameParts(first, last) {
  const f = clean(first).split(/[\s-]+/)[0] || '';
  const words = clean(last).replace(/'/g, '').split(/[\s-]+/).filter(Boolean);
  const prefix = [];
  while (words.length > 1 && PREFIXES.has(words[0])) prefix.push(words.shift());
  return { first: f, initial: f[0] || '', prefix: prefix.join(''), core: words.join(''), full: prefix.join('') + words.join('') };
}

// Schrijfwijzen op volgorde van hoe vaak Nederlandse bedrijven ze gebruiken.
const PATTERNS = {
  'first.last': (n, l) => `${n.first}.${l}`,
  'f.last': (n, l) => `${n.initial}.${l}`,
  first: (n) => n.first,
  flast: (n, l) => `${n.initial}${l}`,
  firstlast: (n, l) => `${n.first}${l}`,
  last: (n, l) => l,
  'first_last': (n, l) => `${n.first}_${l}`,
  'first-last': (n, l) => `${n.first}-${l}`,
  firstl: (n, l) => `${n.first}${l[0]}`,
  'last.first': (n, l) => `${l}.${n.first}`,
};

function candidates(first, last, domain, preferred) {
  const n = nameParts(first, last);
  if (!n.first || !n.core) return [];
  const order = Object.keys(PATTERNS);
  if (preferred && PATTERNS[preferred]) order.unshift(preferred);
  const locals = [];
  for (const key of order) {
    for (const lastName of n.prefix ? [n.full, n.core] : [n.full]) {
      const local = PATTERNS[key](n, lastName);
      if (!locals.includes(local)) locals.push(local);
    }
  }
  return locals.slice(0, 14).map((local) => `${local}@${domain}`);
}

/** Leidt de huisstijl van adressen af uit persoonlijke adressen die op de website staan. */
function inferPattern(emails) {
  const counts = {};
  for (const email of emails) {
    const local = email.split('@')[0];
    const key = /^[a-z]\.[a-z]{2,}$/.test(local) ? 'f.last'
      : /^[a-z]{2,}\.[a-z]{2,}$/.test(local) ? 'first.last'
      : /^[a-z]{2,}_[a-z]{2,}$/.test(local) ? 'first_last'
      : /^[a-z]{2,}-[a-z]{2,}$/.test(local) ? 'first-last'
      : null;
    if (key) counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

/**
 * Zoekt het zakelijke adres van één persoon bij een bedrijf.
 * Bevestigt via de mailserver waar dat kan en valt anders terug op de schrijfwijze
 * die het bedrijf zelf op de website gebruikt.
 */
async function findEmail({ first, last, site }, options = {}) {
  const normalized = normalizeSite(site);
  if (!normalized) throw new Error('Voer een geldige website in');
  const domain = normalized.host.replace(/:\d+$/, '');
  const emailDomain = options.emailDomain || domain;
  const name = `${String(first).trim()} ${String(last).trim()}`.trim();

  let list = candidates(first, last, emailDomain);
  if (!list.length) throw new Error('Vul een voornaam en een achternaam in');

  const probe = await probeDomain(emailDomain, list, options);
  if (!probe.mx) throw new Error(`${emailDomain} ontvangt geen e-mail`);

  const checked = list.map((email) => ({ email, ...probe.results.get(email) }));
  const confirmed = checked.find((c) => c.verdict === 'geldig');
  if (confirmed) {
    return { email: confirmed.email, name, site: domain, confidence: 'bevestigd', verdict: 'geldig',
      reason: 'Bevestigd door de mailserver', candidates: checked };
  }

  // Geen uitsluitsel van de mailserver: kijk welke schrijfwijze het bedrijf zelf publiceert.
  let pattern = null;
  try {
    const scan = await scanSite(site, { genericOnly: false, checkMx: false, maxPages: 4, signal: options.signal, allowPrivate: options.allowPrivate });
    const personal = scan.emails.filter((e) => e.type === 'persoonlijk' && e.email.endsWith(`@${emailDomain}`)).map((e) => e.email);
    const exact = personal.find((e) => list.includes(e));
    if (exact) {
      return { email: exact, name, site: domain, confidence: 'bevestigd', verdict: 'onbekend',
        reason: 'Dit adres staat op de website', candidates: checked };
    }
    pattern = inferPattern(personal);
  } catch { /* website onbereikbaar: ga verder met de meest gebruikte schrijfwijze */ }

  if (pattern) list = candidates(first, last, emailDomain, pattern);
  const allRejected = checked.every((c) => c.verdict === 'ongeldig');
  if (allRejected && !pattern) {
    return { email: null, name, site: domain, confidence: 'niet gevonden', verdict: 'ongeldig',
      reason: 'De mailserver kent geen van de gangbare schrijfwijzen', candidates: checked };
  }
  const verdict = probe.catchAll ? 'catch-all' : 'onbekend';
  return pattern
    ? { email: list[0], name, site: domain, confidence: 'waarschijnlijk', verdict,
      reason: 'Volgt de schrijfwijze van andere adressen op de website', candidates: checked }
    : { email: list[0], name, site: domain, confidence: 'onzeker', verdict,
      reason: 'Meest gebruikte schrijfwijze, niet bevestigd', candidates: checked };
}

module.exports = { findEmail, candidates, nameParts, inferPattern, classify };
