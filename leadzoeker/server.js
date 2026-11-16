'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { scanSite, normalizeSite } = require('./lib/scraper');
const { verifyEmails } = require('./lib/verifier');
const { findEmail } = require('./lib/finder');
const { LeadStore, STATUSES } = require('./lib/store');
const { searchCompanies, BRANCHES } = require('./lib/companies');

const PORT = Number(process.env.PORT) || 4173;
const HOST = '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_ITEMS = 200;
const CONCURRENCY = 4;

// Alleen voor de geautomatiseerde tests: lokale testservers toestaan.
const TEST_MODE = process.env.LEADZOEKER_ALLOW_PRIVATE === '1';
const testOptions = TEST_MODE && process.env.LEADZOEKER_SMTP_PORT
  ? { port: Number(process.env.LEADZOEKER_SMTP_PORT), resolveMx: async () => ['127.0.0.1'], emailDomain: process.env.LEADZOEKER_EMAIL_DOMAIN }
  : {};

const store = new LeadStore(process.env.LEADZOEKER_DATA || path.join(__dirname, 'data', 'leads.json'));

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readJson(req, limit = 400_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('Verzoek is te groot'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new Error('Ongeldig verzoek'));
      }
    });
    req.on('error', reject);
  });
}

/** Alleen de eigen pagina op deze computer mag de tool aansturen. */
function isTrusted(req) {
  const host = (req.headers.host || '').replace(/:\d+$/, '');
  if (host !== 'localhost' && host !== '127.0.0.1') return false;
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) return false;
  return req.method === 'GET' || /^application\/json/.test(req.headers['content-type'] || '');
}

function openStream(res) {
  const controller = new AbortController();
  res.on('close', () => controller.abort());
  res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' });
  return { controller, send: (event) => { if (!controller.signal.aborted) res.write(`${JSON.stringify(event)}\n`); } };
}

async function handleScan(req, res) {
  const payload = await readJson(req);
  const unique = new Map();
  for (const line of Array.isArray(payload.sites) ? payload.sites : []) {
    const site = normalizeSite(line);
    if (site && !unique.has(site.host)) unique.set(site.host, String(line).trim());
  }
  const sites = [...unique.values()];
  if (!sites.length) return sendJson(res, 400, { error: 'Voer minimaal één geldige website in' });
  if (sites.length > MAX_ITEMS) return sendJson(res, 400, { error: `Maximaal ${MAX_ITEMS} websites per zoekopdracht` });

  const { controller, send } = openStream(res);
  send({ type: 'start', total: sites.length });
  const options = {
    maxPages: Math.min(Math.max(Number(payload.maxPages) || 5, 1), 10),
    genericOnly: payload.genericOnly !== false,
    checkMx: !TEST_MODE,
    signal: controller.signal,
    allowPrivate: TEST_MODE,
  };

  let next = 0;
  const worker = async () => {
    while (next < sites.length && !controller.signal.aborted) {
      const site = sites[next];
      next += 1;
      let result;
      try {
        result = await scanSite(site, options);
      } catch (error) {
        result = { site, status: 'fout', message: error.message, pages: 0, emails: [] };
      }
      send({ type: 'site', result });
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, sites.length) }, worker));
  send({ type: 'done' });
  res.end();
}

async function handleVerify(req, res) {
  const payload = await readJson(req);
  const emails = [...new Set((Array.isArray(payload.emails) ? payload.emails : []).map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
  if (!emails.length) return sendJson(res, 400, { error: 'Voer minimaal één e-mailadres in' });
  if (emails.length > MAX_ITEMS) return sendJson(res, 400, { error: `Maximaal ${MAX_ITEMS} adressen per controle` });

  const { controller, send } = openStream(res);
  send({ type: 'start', total: emails.length });
  await verifyEmails(emails, { ...testOptions, signal: controller.signal, onResult: (result) => send({ type: 'result', result }) });
  send({ type: 'done' });
  res.end();
}

async function handleFind(req, res) {
  const payload = await readJson(req);
  try {
    const result = await findEmail(
      { first: String(payload.first || '').slice(0, 60), last: String(payload.last || '').slice(0, 80), site: String(payload.site || '').slice(0, 200) },
      { ...testOptions, allowPrivate: TEST_MODE },
    );
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
}

async function handleCompanies(req, res) {
  if (req.method === 'GET') return sendJson(res, 200, { keywords: Object.keys(BRANCHES).sort() });
  const payload = await readJson(req);
  const result = await searchCompanies(
    { keyword: String(payload.keyword || '').slice(0, 60), place: String(payload.place || '').slice(0, 80) },
    TEST_MODE && process.env.LEADZOEKER_MAP_URL ? { nominatim: `${process.env.LEADZOEKER_MAP_URL}/search`, overpass: `${process.env.LEADZOEKER_MAP_URL}/interpreter` } : {},
  );
  sendJson(res, 200, result);
}

async function handleLeads(req, res) {
  if (req.method === 'GET') return sendJson(res, 200, { leads: store.list(), statuses: STATUSES });
  const payload = await readJson(req);
  if (req.method === 'POST') {
    const items = Array.isArray(payload.leads) ? payload.leads.slice(0, 1000) : [];
    return sendJson(res, 200, { added: store.upsert(items), total: store.leads.size });
  }
  if (req.method === 'PATCH') {
    return store.setStatus(String(payload.email), String(payload.status))
      ? sendJson(res, 200, { ok: true })
      : sendJson(res, 400, { error: 'Lead of status onbekend' });
  }
  if (req.method === 'DELETE') {
    return sendJson(res, 200, { removed: store.remove(Array.isArray(payload.emails) ? payload.emails.map(String) : []) });
  }
  return sendJson(res, 405, { error: 'Niet toegestaan' });
}

const ROUTES = {
  'POST /api/scan': handleScan,
  'POST /api/verify': handleVerify,
  'POST /api/find': handleFind,
  'GET /api/companies': handleCompanies,
  'POST /api/companies': handleCompanies,
  'GET /api/leads': handleLeads,
  'POST /api/leads': handleLeads,
  'PATCH /api/leads': handleLeads,
  'DELETE /api/leads': handleLeads,
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const route = ROUTES[`${req.method} ${url.pathname}`];
  if (route) {
    if (!isTrusted(req)) return sendJson(res, 403, { error: 'Verzoek geweigerd' });
    route(req, res).catch((error) => {
      if (!res.headersSent) sendJson(res, 400, { error: error.message || 'Onverwachte fout' });
      else res.end();
    });
    return;
  }
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Niet toegestaan' });

  const file = path.join(PUBLIC_DIR, path.normalize(url.pathname === '/' ? 'index.html' : url.pathname));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return sendJson(res, 403, { error: 'Geen toegang' });
  fs.readFile(file, (error, data) => {
    if (error) return sendJson(res, 404, { error: 'Niet gevonden' });
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-cache',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'",
    });
    res.end(data);
  });
});

if (require.main === module) {
  server.listen(PORT, HOST, () => console.log(`Clean Leadzoeker draait op http://localhost:${PORT}`));
}

module.exports = { server };
