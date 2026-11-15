'use strict';

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { scanSite, extractEmails, classify, parseRobots, isAllowed } = require('../lib/scraper');

function cfEncode(email, key = 0x5e) {
  return [key, ...Buffer.from(email).map((b) => b ^ key)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const PAGES = {
  '/robots.txt': 'User-agent: *\nDisallow: /team\n',
  '/': '<a href="/contact">Contact</a> <a href="/team">Team</a> <a href="/blog">Blog</a> <img src="logo@2x.png">',
  '/contact': '<a href="mailto:Info@Bedrijf.nl?subject=Hoi">Mail</a> jan.jansen [at] bedrijf [dot] nl ' +
    `<span data-cfemail="${cfEncode('planning@bedrijf.nl')}">x</span>` + ' noreply@bedrijf.nl sales&#64;bedrijf.nl',
  '/team': 'geheim@bedrijf.nl',
};

function fixture() {
  const server = http.createServer((req, res) => {
    const body = PAGES[req.url];
    res.writeHead(body ? 200 : 404, { 'content-type': req.url === '/robots.txt' ? 'text/plain' : 'text/html' });
    res.end(body || '');
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

test('extractEmails vindt mailto, verhulde en gecodeerde adressen en negeert ruis', () => {
  const emails = extractEmails(PAGES['/contact'] + PAGES['/']);
  assert.deepStrictEqual(emails.sort(), ['info@bedrijf.nl', 'jan.jansen@bedrijf.nl', 'planning@bedrijf.nl', 'sales@bedrijf.nl']);
});

test('classify onderscheidt algemene van persoonlijke adressen', () => {
  assert.strictEqual(classify('info@bedrijf.nl'), 'algemeen');
  assert.strictEqual(classify('jan.jansen@bedrijf.nl'), 'persoonlijk');
});

test('robots.txt wordt gerespecteerd', () => {
  const rules = parseRobots('User-agent: Googlebot\nDisallow: /a\n\nUser-agent: *\nDisallow: /prive\n');
  assert.deepStrictEqual(rules, ['/prive']);
  assert.strictEqual(isAllowed('/prive/x', rules), false);
  assert.strictEqual(isAllowed('/contact', rules), true);
});

test('scanSite doorzoekt contactpagina, slaat verboden pagina over en filtert op type', async () => {
  const server = await fixture();
  const site = `http://127.0.0.1:${server.address().port}`;
  try {
    const all = await scanSite(site, { genericOnly: false, checkMx: false, allowPrivate: true });
    assert.deepStrictEqual(all.emails.map((e) => e.email), ['info@bedrijf.nl', 'planning@bedrijf.nl', 'sales@bedrijf.nl', 'jan.jansen@bedrijf.nl']);
    assert.strictEqual(all.emails[0].source, '/contact');
    assert.ok(!all.emails.some((e) => e.email === 'geheim@bedrijf.nl'));

    const generic = await scanSite(site, { checkMx: false, allowPrivate: true });
    assert.deepStrictEqual(generic.emails.map((e) => e.email), ['info@bedrijf.nl', 'planning@bedrijf.nl', 'sales@bedrijf.nl']);
  } finally {
    server.close();
  }
});

test('interne adressen worden geweigerd', async () => {
  const result = await scanSite('http://127.0.0.1:9', { checkMx: false });
  assert.strictEqual(result.status, 'fout');
  assert.strictEqual(result.emails.length, 0);
});
