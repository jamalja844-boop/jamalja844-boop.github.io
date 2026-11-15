'use strict';

const test = require('node:test');
const assert = require('node:assert');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { verifyEmails } = require('../lib/verifier');
const { findEmail, candidates, nameParts, inferPattern } = require('../lib/finder');
const { LeadStore } = require('../lib/store');

/** Nagebootste mailserver: kent alleen de opgegeven postvakken, of accepteert alles. */
function fakeSmtp(known, { catchAll = false } = {}) {
  const server = net.createServer((socket) => {
    socket.write('220 test ESMTP\r\n');
    socket.on('data', (data) => {
      for (const line of data.toString().split('\r\n').filter(Boolean)) {
        if (/^EHLO/i.test(line)) socket.write('250-test\r\n250 OK\r\n');
        else if (/^MAIL/i.test(line)) socket.write('250 OK\r\n');
        else if (/^RCPT/i.test(line)) {
          const address = line.match(/<(.+)>/)[1];
          socket.write(catchAll || known.includes(address) ? '250 OK\r\n' : '550 5.1.1 User unknown\r\n');
        } else if (/^QUIT/i.test(line)) socket.end('221 Bye\r\n');
      }
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}
const via = (server) => ({ port: server.address().port, resolveMx: async () => ['127.0.0.1'] });

test('verifyEmails beoordeelt schrijfwijze, wegwerpadres, bestaand en onbekend postvak', async () => {
  const smtp = await fakeSmtp(['info@bedrijf.nl']);
  try {
    const results = await verifyEmails(['Info@Bedrijf.nl', 'weg@bedrijf.nl', 'geen-adres', 'x@mailinator.com'], via(smtp));
    const verdicts = Object.fromEntries(results.map((r) => [r.email, r.verdict]));
    assert.deepStrictEqual(verdicts, {
      'info@bedrijf.nl': 'geldig', 'weg@bedrijf.nl': 'ongeldig', 'geen-adres': 'ongeldig', 'x@mailinator.com': 'ongeldig',
    });
  } finally {
    smtp.close();
  }
});

test('verifyEmails herkent een server die elk adres accepteert en een domein zonder mailserver', async () => {
  const smtp = await fakeSmtp([], { catchAll: true });
  try {
    const [catchAll] = await verifyEmails(['info@bedrijf.nl'], via(smtp));
    assert.strictEqual(catchAll.verdict, 'catch-all');
    const [noMx] = await verifyEmails(['info@bedrijf.nl'], { resolveMx: async () => [] });
    assert.strictEqual(noMx.reason, 'Domein ontvangt geen e-mail');
  } finally {
    smtp.close();
  }
});

test('candidates gaat goed om met tussenvoegsels en accenten', () => {
  assert.deepStrictEqual(nameParts('José', 'van der Berg'), { first: 'jose', initial: 'j', prefix: 'vander', core: 'berg', full: 'vanderberg' });
  const list = candidates('Jan', 'de Vries', 'bedrijf.nl');
  assert.strictEqual(list[0], 'jan.devries@bedrijf.nl');
  assert.ok(list.includes('jan.vries@bedrijf.nl') && list.includes('j.devries@bedrijf.nl') && list.includes('jan@bedrijf.nl'));
  assert.strictEqual(inferPattern(['p.jansen@b.nl', 'k.bakker@b.nl', 'anna.smit@b.nl']), 'f.last');
});

test('findEmail bevestigt het adres via de mailserver', async () => {
  const smtp = await fakeSmtp(['j.devries@bedrijf.nl']);
  try {
    const result = await findEmail({ first: 'Jan', last: 'de Vries', site: 'bedrijf.nl' }, via(smtp));
    assert.strictEqual(result.email, 'j.devries@bedrijf.nl');
    assert.strictEqual(result.confidence, 'bevestigd');
  } finally {
    smtp.close();
  }
});

test('LeadStore bewaart, ontdubbelt en behoudt de status', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'leads-')), 'leads.json');
  const store = new LeadStore(file);
  assert.strictEqual(store.upsert([{ email: 'Info@Bedrijf.nl', site: 'bedrijf.nl' }, { email: 'geen adres' }]), 1);
  assert.ok(store.setStatus('info@bedrijf.nl', 'benaderd'));
  assert.strictEqual(store.upsert([{ email: 'info@bedrijf.nl', name: 'Receptie' }]), 0);

  const reopened = new LeadStore(file).list();
  assert.strictEqual(reopened.length, 1);
  assert.deepStrictEqual([reopened[0].status, reopened[0].name, reopened[0].site], ['benaderd', 'Receptie', 'bedrijf.nl']);
  assert.strictEqual(store.remove(['info@bedrijf.nl']), 1);
});
