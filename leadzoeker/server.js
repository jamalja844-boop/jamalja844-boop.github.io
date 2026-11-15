'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { scanSite, normalizeSite } = require('./lib/scraper');

const PORT = Number(process.env.PORT) || 4173;
const HOST = '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_SITES = 200;
const CONCURRENCY = 4;
const ALLOW_PRIVATE = process.env.LEADZOEKER_ALLOW_PRIVATE === '1';

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readBody(req, limit = 200_000) {
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
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleScan(req, res) {
  // Alleen JSON van de eigen pagina: andere websites kunnen zo geen scan starten.
  const origin = req.headers.origin;
  if (!/^application\/json/.test(req.headers['content-type'] || '') ||
      (origin && new URL(origin).host !== req.headers.host)) {
    return sendJson(res, 403, { error: 'Verzoek geweigerd' });
  }

  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch {
    return sendJson(res, 400, { error: 'Ongeldig verzoek' });
  }

  const unique = new Map();
  for (const line of Array.isArray(payload.sites) ? payload.sites : []) {
    const site = normalizeSite(line);
    if (site && !unique.has(site.host)) unique.set(site.host, String(line).trim());
  }
  const sites = [...unique.values()];
  if (!sites.length) return sendJson(res, 400, { error: 'Voer minimaal één geldige website in' });
  if (sites.length > MAX_SITES) return sendJson(res, 400, { error: `Maximaal ${MAX_SITES} websites per zoekopdracht` });

  const controller = new AbortController();
  res.on('close', () => controller.abort());
  res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' });
  const send = (event) => res.write(`${JSON.stringify(event)}\n`);
  send({ type: 'start', total: sites.length });

  const options = {
    maxPages: Math.min(Math.max(Number(payload.maxPages) || 5, 1), 10),
    genericOnly: payload.genericOnly !== false,
    checkMx: !ALLOW_PRIVATE,
    signal: controller.signal,
    allowPrivate: ALLOW_PRIVATE,
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
      if (!controller.signal.aborted) send({ type: 'site', result });
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, sites.length) }, worker));
  if (!controller.signal.aborted) send({ type: 'done' });
  res.end();
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'POST' && url.pathname === '/api/scan') {
    handleScan(req, res).catch(() => { if (!res.headersSent) sendJson(res, 500, { error: 'Onverwachte fout' }); else res.end(); });
    return;
  }
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Niet toegestaan' });

  const file = path.join(PUBLIC_DIR, path.normalize(url.pathname === '/' ? 'index.html' : url.pathname));
  if (!file.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: 'Geen toegang' });
  fs.readFile(file, (error, data) => {
    if (error) return sendJson(res, 404, { error: 'Niet gevonden' });
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'",
    });
    res.end(data);
  });
});

if (require.main === module) {
  server.listen(PORT, HOST, () => console.log(`Clean Leadzoeker draait op http://localhost:${PORT}`));
}

module.exports = { server };
