'use strict';

const dns = require('node:dns').promises;
const net = require('node:net');
const crypto = require('node:crypto');
const { classify } = require('./scraper');

const SYNTAX_RE = /^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
const SESSION_SIZE = 10;

const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', '10minutemail.com', 'yopmail.com', 'tempmail.com', 'temp-mail.org',
  'trashmail.com', 'sharklasers.com', 'getnada.com', 'maildrop.cc', 'throwawaymail.com', 'fakeinbox.com',
  'dispostable.com', 'mintemail.com', 'mohmal.com', 'emailondeck.com', 'tempinbox.com', 'mytemp.email',
]);
const FREE = new Set([
  'gmail.com', 'hotmail.com', 'hotmail.nl', 'outlook.com', 'outlook.nl', 'live.nl', 'live.com', 'msn.com',
  'yahoo.com', 'yahoo.nl', 'icloud.com', 'me.com', 'ziggo.nl', 'kpnmail.nl', 'planet.nl', 'hetnet.nl',
  'xs4all.nl', 'home.nl', 'upcmail.nl', 'casema.nl', 'chello.nl', 'quicknet.nl', 'telfort.nl', 'tele2.nl',
  'online.nl', 'zeelandnet.nl', 'proton.me', 'protonmail.com', 'gmx.com', 'gmx.net', 'aol.com',
]);
// Antwoorden die over de afzender gaan en dus niets zeggen over het postvak.
const POLICY_RE = /5\.7\.\d|spamhaus|blocked|blacklist|block list|denied|policy|reputation|not allowed|refused|rbl/i;

const isValidSyntax = (email) => SYNTAX_RE.test(email) && !email.includes('..');

async function defaultResolveMx(domain) {
  try {
    const records = await dns.resolveMx(domain);
    return records.filter((r) => r.exchange).sort((a, b) => a.priority - b.priority).map((r) => r.exchange);
  } catch {
    return [];
  }
}

/** Vraagt de mailserver per adres of het postvak bestaat. Er wordt geen e-mail verstuurd. */
function smtpSession({ host, port = 25, helo, from, recipients, timeoutMs = 8000 }) {
  return new Promise((resolve) => {
    const replies = new Map();
    const commands = [`EHLO ${helo}`, `MAIL FROM:<${from}>`, ...recipients.map((r) => `RCPT TO:<${r}>`), 'QUIT'];
    let buffer = '';
    let step = 0;
    let settled = false;
    const socket = net.connect({ host, port });
    const finish = (error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ replies, error });
    };
    socket.setTimeout(timeoutMs, () => finish('timeout'));
    socket.on('error', (error) => finish(error.code || 'verbinding'));
    socket.on('close', () => finish(replies.size ? null : 'verbroken'));
    socket.on('data', (chunk) => {
      buffer += chunk;
      let match;
      while ((match = buffer.match(/^(?:\d{3}-[^\n]*\n)*(\d{3})(?: [^\n]*)?\r?\n/))) {
        buffer = buffer.slice(match[0].length);
        const code = Number(match[1]);
        if (step === 0 && code !== 220) return finish('begroeting');
        if ((step === 1 || step === 2) && code >= 400) return finish(POLICY_RE.test(match[0]) ? 'geweigerd' : 'afzender');
        if (step >= 3 && step < 3 + recipients.length) replies.set(recipients[step - 3], { code, text: match[0] });
        if (step >= commands.length) return finish(null);
        socket.write(`${commands[step]}\r\n`);
        step += 1;
      }
    });
  });
}

function verdictFor(reply, catchAll) {
  if (!reply) return { verdict: 'onbekend', reason: 'Mailserver gaf geen uitsluitsel' };
  if (reply.code === 250 || reply.code === 251) {
    return catchAll
      ? { verdict: 'catch-all', reason: 'Mailserver accepteert elk adres' }
      : { verdict: 'geldig', reason: 'Postvak bestaat' };
  }
  if (reply.code >= 500 && !POLICY_RE.test(reply.text)) return { verdict: 'ongeldig', reason: 'Postvak bestaat niet' };
  return { verdict: 'onbekend', reason: 'Mailserver gaf geen uitsluitsel' };
}

/**
 * Controleert adressen van één domein. Een willekeurig testadres vooraf laat zien
 * of de server alles accepteert; in dat geval is een bevestiging niets waard.
 */
async function probeDomain(domain, emails, options = {}) {
  const {
    smtp = true, resolveMx = defaultResolveMx, port = 25,
    helo = 'cleanschoonmaakbedrijf.nl', from = 'controle@cleanschoonmaakbedrijf.nl',
  } = options;
  const out = new Map();
  const hosts = await resolveMx(domain);
  if (!hosts.length) {
    for (const email of emails) out.set(email, { verdict: 'ongeldig', reason: 'Domein ontvangt geen e-mail' });
    return { mx: false, catchAll: false, results: out };
  }
  if (!smtp) {
    for (const email of emails) out.set(email, { verdict: 'onbekend', reason: 'Domein ontvangt e-mail, postvak niet gecontroleerd' });
    return { mx: true, catchAll: false, results: out };
  }

  const probe = `lz-${crypto.randomBytes(6).toString('hex')}@${domain}`;
  let catchAll = false;
  for (let i = 0; i < emails.length; i += SESSION_SIZE) {
    const batch = emails.slice(i, i + SESSION_SIZE);
    let session = { replies: new Map(), error: 'geen' };
    for (const host of hosts.slice(0, 2)) {
      session = await smtpSession({ host, port, helo, from, recipients: [probe, ...batch] });
      if (session.replies.size) break;
    }
    const probeReply = session.replies.get(probe);
    catchAll = Boolean(probeReply && (probeReply.code === 250 || probeReply.code === 251));
    for (const email of batch) out.set(email, verdictFor(session.replies.get(email), catchAll));
  }
  return { mx: true, catchAll, results: out };
}

/** Controleert een lijst adressen: schrijfwijze, wegwerpdomein, MX en postvak. */
async function verifyEmails(input, options = {}) {
  const { onResult = () => {}, signal, concurrency = 4 } = options;
  const results = [];
  const byDomain = new Map();
  const emit = (email, verdict, reason) => {
    const domain = email.split('@')[1] || '';
    const result = { email, verdict, reason, type: verdict === 'ongeldig' && !domain ? '' : classify(email), free: FREE.has(domain) };
    results.push(result);
    onResult(result);
  };

  for (const email of [...new Set(input.map((e) => String(e).trim().toLowerCase()).filter(Boolean))]) {
    if (!isValidSyntax(email)) { emit(email, 'ongeldig', 'Geen geldig e-mailadres'); continue; }
    const domain = email.split('@')[1];
    if (DISPOSABLE.has(domain)) { emit(email, 'ongeldig', 'Wegwerpadres'); continue; }
    if (!byDomain.has(domain)) byDomain.set(domain, []);
    byDomain.get(domain).push(email);
  }

  const domains = [...byDomain.keys()];
  let next = 0;
  const worker = async () => {
    while (next < domains.length && !signal?.aborted) {
      const domain = domains[next];
      next += 1;
      const emails = byDomain.get(domain);
      let probe;
      try {
        probe = await probeDomain(domain, emails, options);
      } catch {
        probe = { results: new Map() };
      }
      for (const email of emails) {
        const r = probe.results.get(email) || { verdict: 'onbekend', reason: 'Mailserver gaf geen uitsluitsel' };
        emit(email, r.verdict, r.reason);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, domains.length) }, worker));
  return results;
}

module.exports = { verifyEmails, probeDomain, isValidSyntax, FREE };
