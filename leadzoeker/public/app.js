'use strict';

const $ = (id) => document.getElementById(id);
const MAX_ITEMS = 200;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const cap = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const lines = (value) => [...new Set(value.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean))];

const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* opslag is optioneel */ } },
};

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
}
const tag = (value, label) => el('span', { className: `tag tag-${value.replace(/\s/g, '-')}`, textContent: label || cap(value) });
const mailLink = (email) => el('a', { href: `mailto:${email}`, textContent: email });
const withSub = (main, sub) => el('span', {}, main, sub ? el('span', { className: 'sub', textContent: sub }) : null);

/* Kolommen per onderdeel: text() voedt filter en CSV, node() de tabel. */
const emailColumn = { label: 'E-mailadres', cls: 'email wide', text: (r) => r.email || '', node: (r) => (r.email ? mailLink(r.email) : el('span', { textContent: 'Niet gevonden' })) };
const typeColumn = { label: 'Soort', text: (r) => r.type || '', node: (r) => (r.type ? tag(r.type) : '') };
const verdictColumn = { label: 'Controle', text: (r) => r.verdict || '', node: (r) => (r.verdict ? tag(r.verdict, VERDICT_LABELS[r.verdict]) : '') };
const VERDICT_LABELS = { geldig: 'Geldig', ongeldig: 'Ongeldig', 'catch-all': 'Accepteert alles', onbekend: 'Onbekend' };

const MODES = {
  scan: {
    title: 'Vind het juiste postvak bij elk bedrijf',
    lede: 'Plak een lijst met websites. De Leadzoeker leest de contactpagina\'s en zet de gepubliceerde e-mailadressen voor je op een rij.',
    idle: 'Nog geen zoekopdracht',
    empty: ['Hier komt je lijst', 'Plak links een paar websites en kies Zoek adressen.'],
    columns: [
      emailColumn,
      { label: 'Website', cls: 'site', text: (r) => r.site },
      typeColumn,
      { label: 'Gevonden op', cls: 'source', text: (r) => r.source },
      { label: 'Mailserver', text: (r) => (r.mx === null ? '' : r.mx ? 'ja' : 'nee'),
        node: (r) => el('span', { className: r.mx === null ? '' : r.mx ? 'mx-ok' : 'mx-no', textContent: r.mx === null ? 'Niet gecontroleerd' : r.mx ? 'Ontvangt e-mail' : 'Geen mailserver' }) },
    ],
  },
  find: {
    title: 'Zoek het adres van één contactpersoon',
    lede: 'Weet je wie je moet hebben, maar niet hoe je diegene bereikt? Vul de naam en de website van het bedrijf in.',
    idle: 'Nog niemand gezocht',
    empty: ['Zoek een contactpersoon', 'Het gevonden adres verschijnt hier, met erbij hoe zeker het is.'],
    columns: [
      emailColumn,
      { label: 'Naam', text: (r) => r.name, node: (r) => withSub(r.name, r.site) },
      { label: 'Zekerheid', text: (r) => r.confidence, node: (r) => (r.email ? tag(r.confidence) : tag('ongeldig', 'Niet gevonden')) },
      { label: 'Toelichting', cls: 'source wide', text: (r) => r.reason },
    ],
  },
  verify: {
    title: 'Controleer adressen voordat je mailt',
    lede: 'Elk adres wordt nagekeken op schrijfwijze, mailserver en postvak. Zo voorkom je dat berichten onbestelbaar terugkomen.',
    idle: 'Nog niets gecontroleerd',
    empty: ['Plak je adressen', 'Per adres zie je of het postvak bestaat en waarom.'],
    columns: [
      emailColumn,
      verdictColumn,
      { label: 'Toelichting', cls: 'source', text: (r) => r.reason },
      typeColumn,
      { label: 'Aanbieder', cls: 'source', text: (r) => (!r.type ? '' : r.free ? 'Gratis e-maildienst' : 'Eigen domein') },
    ],
  },
  leads: {
    title: 'Al je leads op één plek',
    lede: 'Alles wat je bewaart komt hier terecht. Houd per lead bij hoe ver je bent.',
    idle: 'Nog geen leads bewaard',
    empty: ['Je bestand is nog leeg', 'Kies bij een ander onderdeel Bewaar in mijn leads om adressen hier te verzamelen.'],
    columns: [
      emailColumn,
      { label: 'Bedrijf', text: (r) => r.site, node: (r) => withSub(r.name || r.site || '', r.name ? r.site : '') },
      typeColumn,
      verdictColumn,
      { label: 'Status', text: (r) => r.status, node: (r) => statusSelect(r) },
      { label: '', text: () => '', csv: false, node: (r) => el('button', { className: 'icon-btn', type: 'button', textContent: 'Verwijder', onclick: () => removeLead(r.email) }) },
    ],
  },
};

const state = {
  mode: 'scan',
  rows: { scan: [], find: [], verify: [], leads: [] },
  status: { scan: '', find: '', verify: '', leads: '' },
  progress: { scan: 0, find: 0, verify: 0, leads: 0 },
  scan: { total: 0, done: 0, withHit: 0, misses: [] },
  statuses: [],
  running: null,
  controller: null,
  shown: new Set(),
};

const ui = {
  title: $('title'), lede: $('lede'), tally: $('tally'), status: $('status'), filter: $('filter'), bar: $('bar'),
  head: $('head'), rows: $('rows'), empty: $('empty'), emptyTitle: $('emptyTitle'), emptyText: $('emptyText'),
  save: $('saveBtn'), copy: $('copyBtn'), csv: $('csvBtn'), misses: $('misses'), missesTitle: $('missesTitle'),
  missList: $('missList'), leadCount: $('leadCount'),
};
const form = (mode) => $(`form-${mode}`);
const formError = (mode, message) => { form(mode).querySelector('.form-error').textContent = message; };

/* ---------- Weergave ---------- */

function visibleRows() {
  const mode = MODES[state.mode];
  let rows = state.rows[state.mode];
  if (state.mode === 'leads') {
    const wanted = $('statusFilter').value.trim().toLowerCase();
    if (wanted) rows = rows.filter((r) => r.status.includes(wanted));
  }
  const q = ui.filter.value.trim().toLowerCase();
  return q ? rows.filter((r) => mode.columns.some((c) => String(c.text(r)).toLowerCase().includes(q))) : rows;
}

function tallyText() {
  const rows = state.rows[state.mode];
  if (!rows.length && !(state.mode === 'scan' && state.scan.total)) return el('span', { textContent: MODES[state.mode].idle });
  const strong = (text) => el('b', { textContent: text });
  if (state.mode === 'scan') {
    return el('span', {}, strong(plural(rows.length, 'adres', 'adressen')), ` bij ${state.scan.withHit} van ${plural(state.scan.total, 'website', 'websites')}`);
  }
  if (state.mode === 'find') {
    const found = rows.filter((r) => r.email).length;
    return el('span', {}, strong(plural(found, 'adres', 'adressen')), ` gevonden voor ${plural(rows.length, 'persoon', 'personen')}`);
  }
  if (state.mode === 'verify') {
    const valid = rows.filter((r) => r.verdict === 'geldig').length;
    return el('span', {}, strong(`${valid} geldig`), ` van ${plural(rows.length, 'adres', 'adressen')}`);
  }
  return el('span', {}, strong(plural(rows.length, 'lead', 'leads')), ' in je bestand');
}

function render() {
  const mode = MODES[state.mode];
  const list = visibleRows();
  const all = state.rows[state.mode];

  ui.head.replaceChildren(...mode.columns.map((c) => el('th', { textContent: c.label })));
  const before = state.shown;
  ui.rows.replaceChildren(...list.map((row) => {
    const tr = el('tr', {}, ...mode.columns.map((c) => {
      const content = c.node ? c.node(row) : c.text(row);
      return el('td', { className: c.cls || '' }, content);
    }));
    const key = `${state.mode}:${row.email || row.name}`;
    if (!before.has(key)) tr.className = 'new';
    return tr;
  }));
  state.shown = new Set(list.map((row) => `${state.mode}:${row.email || row.name}`));

  ui.empty.hidden = list.length > 0;
  if (!list.length) {
    const [title, text] = all.length ? ['Geen resultaat voor dit filter', 'Pas het filter aan of maak het leeg.']
      : state.running === state.mode ? ['Bezig', 'De eerste resultaten verschijnen binnen enkele seconden.']
      : mode.empty;
    ui.emptyTitle.textContent = title;
    ui.emptyText.textContent = text;
  }

  ui.tally.replaceChildren(tallyText());
  ui.status.textContent = state.status[state.mode];
  ui.bar.style.width = `${state.progress[state.mode]}%`;
  const withEmail = list.filter((r) => r.email).length;
  ui.copy.disabled = ui.csv.disabled = withEmail === 0;
  ui.save.hidden = state.mode === 'leads';
  ui.save.disabled = withEmail === 0;

  const showMisses = state.mode === 'scan' && state.scan.misses.length > 0;
  ui.misses.hidden = !showMisses;
  if (showMisses) {
    ui.missesTitle.textContent = `${plural(state.scan.misses.length, 'website', 'websites')} zonder adres`;
    ui.missList.replaceChildren(...state.scan.misses.map((m) => el('li', {},
      el('span', { textContent: m.site }), el('span', { textContent: m.message || 'Geen e-mailadres gepubliceerd' }))));
  }
}

function setMode(mode) {
  state.mode = mode;
  for (const button of document.querySelectorAll('.modes button')) {
    button.setAttribute('aria-selected', String(button.dataset.mode === mode));
  }
  for (const key of Object.keys(MODES)) form(key).hidden = key !== mode;
  ui.title.textContent = MODES[mode].title;
  ui.lede.textContent = MODES[mode].lede;
  ui.filter.value = '';
  state.shown = new Set(state.rows[mode].map((row) => `${mode}:${row.email || row.name}`));
  store.set('leadzoeker.mode', mode);
  render();
  if (mode === 'leads') loadLeads();
}

function setRunning(mode, running) {
  state.running = running ? mode : null;
  const submit = form(mode).querySelector('[type="submit"]');
  submit.disabled = running;
  submit.textContent = running ? submit.dataset.busy : submit.dataset.label;
  const stop = form(mode).querySelector('[data-stop]');
  if (stop) stop.hidden = !running;
}

function flash(button, text) {
  const original = button.dataset.label || (button.dataset.label = button.textContent);
  button.textContent = text;
  setTimeout(() => { button.textContent = original; }, 1600);
}

/* ---------- Verbinding met de server ---------- */

async function api(method, url, body, signal) {
  let response;
  try {
    response = await fetch(url, {
      method, signal,
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Geen verbinding met de Leadzoeker. Start het programma met "npm start" en probeer het opnieuw.');
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Het verzoek is mislukt');
  }
  return response;
}

/** Leest een stroom resultaten regel voor regel, zodat de tabel live meegroeit. */
async function stream(url, body, onEvent) {
  state.controller = new AbortController();
  const response = await api('POST', url, body, state.controller.signal);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n');
    buffer = parts.pop();
    for (const part of parts) if (part) onEvent(JSON.parse(part));
  }
}

async function runJob(mode, url, body, onEvent, summary) {
  formError(mode, '');
  setRunning(mode, true);
  render();
  let stopped = false;
  try {
    await stream(url, body, onEvent);
  } catch (error) {
    if (error.name === 'AbortError') stopped = true;
    else formError(mode, error.message);
  } finally {
    setRunning(mode, false);
    state.status[mode] = summary(stopped);
    render();
  }
}

/* ---------- Websites doorzoeken ---------- */

form('scan').addEventListener('submit', (event) => {
  event.preventDefault();
  if (state.running) return;
  const sites = lines($('sites').value);
  if (!sites.length) { formError('scan', 'Voer minimaal één website in.'); $('sites').focus(); return; }
  if (sites.length > MAX_ITEMS) { formError('scan', `Je hebt ${sites.length} websites ingevoerd. Het maximum is ${MAX_ITEMS} per zoekopdracht.`); return; }

  state.rows.scan = [];
  state.scan = { total: sites.length, done: 0, withHit: 0, misses: [] };
  state.progress.scan = 0;
  const seen = new Set();
  runJob('scan', '/api/scan', { sites, genericOnly: $('genericOnly').checked, maxPages: Number($('maxPages').value) || 5 }, (event) => {
    if (event.type === 'start') state.scan.total = event.total;
    if (event.type !== 'site') return render();
    const { result } = event;
    state.scan.done += 1;
    for (const hit of result.emails) {
      if (seen.has(hit.email)) continue;
      seen.add(hit.email);
      state.rows.scan.push({ ...hit, site: result.site });
    }
    if (result.emails.length) state.scan.withHit += 1;
    else state.scan.misses.push(result);
    state.progress.scan = Math.round((state.scan.done / state.scan.total) * 100);
    state.status.scan = `${state.scan.done} van ${state.scan.total} websites doorzocht`;
    render();
  }, (stopped) => (stopped
    ? `Gestopt na ${state.scan.done} van ${state.scan.total} websites`
    : `Klaar. ${state.scan.done} van ${state.scan.total} websites doorzocht`));
});

/* ---------- Persoon zoeken ---------- */

form('find').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (state.running) return;
  const body = { first: $('first').value.trim(), last: $('last').value.trim(), site: $('findSite').value.trim() };
  if (!body.first || !body.last) { formError('find', 'Vul een voornaam en een achternaam in.'); return; }
  if (!body.site) { formError('find', 'Vul de website van het bedrijf in.'); $('findSite').focus(); return; }

  formError('find', '');
  setRunning('find', true);
  state.status.find = `Bezig met zoeken naar ${body.first} ${body.last}`;
  render();
  try {
    const result = await (await api('POST', '/api/find', body)).json();
    state.rows.find = [{ ...result, type: result.email ? 'persoonlijk' : '' },
      ...state.rows.find.filter((r) => !(r.name === result.name && r.site === result.site))];
    state.status.find = result.email ? `${result.email} gevonden` : `Geen adres gevonden voor ${result.name}`;
    state.progress.find = 100;
  } catch (error) {
    formError('find', error.message);
    state.status.find = '';
  } finally {
    setRunning('find', false);
    render();
  }
});

/* ---------- Adressen controleren ---------- */

function verify(mode, emails, onResult) {
  let done = 0;
  state.progress[mode] = 0;
  return runJob(mode, '/api/verify', { emails }, (event) => {
    if (event.type !== 'result') return;
    done += 1;
    onResult(event.result);
    state.progress[mode] = Math.round((done / emails.length) * 100);
    state.status[mode] = `${done} van ${emails.length} adressen gecontroleerd`;
    render();
  }, (stopped) => (stopped ? `Gestopt na ${done} van ${emails.length} adressen` : `Klaar. ${plural(done, 'adres', 'adressen')} gecontroleerd`));
}

form('verify').addEventListener('submit', (event) => {
  event.preventDefault();
  if (state.running) return;
  const emails = lines($('emails').value.toLowerCase());
  if (!emails.length) { formError('verify', 'Voer minimaal één e-mailadres in.'); $('emails').focus(); return; }
  if (emails.length > MAX_ITEMS) { formError('verify', `Je hebt ${emails.length} adressen ingevoerd. Het maximum is ${MAX_ITEMS} per controle.`); return; }
  state.rows.verify = [];
  verify('verify', emails, (result) => state.rows.verify.push(result));
});

/* ---------- Mijn leads ---------- */

async function loadLeads() {
  try {
    const data = await (await api('GET', '/api/leads')).json();
    state.rows.leads = data.leads;
    state.statuses = data.statuses;
    $('statusList').replaceChildren(...data.statuses.map((s) => el('option', { value: s })));
    ui.leadCount.textContent = data.leads.length ? plural(data.leads.length, 'lead', 'leads') : 'Je eigen bestand';
    formError('leads', '');
  } catch (error) {
    formError('leads', error.message);
  }
  if (state.mode === 'leads') render();
}

function statusSelect(lead) {
  const select = el('select', { ariaLabel: `Status van ${lead.email}` },
    ...state.statuses.map((s) => el('option', { value: s, textContent: cap(s), selected: s === lead.status })));
  select.addEventListener('change', async () => {
    try {
      await api('PATCH', '/api/leads', { email: lead.email, status: select.value });
      lead.status = select.value;
    } catch (error) {
      select.value = lead.status;
      formError('leads', error.message);
    }
  });
  return select;
}

async function removeLead(email) {
  try {
    await api('DELETE', '/api/leads', { emails: [email] });
    await loadLeads();
    state.status.leads = `${email} verwijderd`;
    render();
  } catch (error) {
    formError('leads', error.message);
  }
}

form('leads').addEventListener('submit', (event) => {
  event.preventDefault();
  if (state.running) return;
  const emails = visibleRows().map((r) => r.email).slice(0, MAX_ITEMS);
  if (!emails.length) { formError('leads', 'Er zijn geen leads om te controleren.'); return; }
  const verdicts = [];
  verify('leads', emails, (result) => {
    verdicts.push({ email: result.email, verdict: result.verdict });
    const lead = state.rows.leads.find((l) => l.email === result.email);
    if (lead) lead.verdict = result.verdict;
  }).then(() => verdicts.length && api('POST', '/api/leads', { leads: verdicts }).catch((error) => formError('leads', error.message)));
});

ui.save.addEventListener('click', async () => {
  const leads = visibleRows().filter((r) => r.email && r.verdict !== 'ongeldig').map((r) => ({
    email: r.email, name: r.name || '', site: r.site || r.email.split('@')[1], type: r.type || '',
    verdict: r.verdict || (r.mx === false ? 'ongeldig' : ''),
  }));
  if (!leads.length) { flash(ui.save, 'Niets om te bewaren'); return; }
  try {
    const data = await (await api('POST', '/api/leads', { leads })).json();
    ui.leadCount.textContent = plural(data.total, 'lead', 'leads');
    flash(ui.save, data.added ? `${data.added} bewaard` : 'Stond er al in');
  } catch {
    flash(ui.save, 'Bewaren lukt niet');
  }
});

/* ---------- Gedeelde knoppen ---------- */

ui.copy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(visibleRows().filter((r) => r.email).map((r) => r.email).join('\n'));
    flash(ui.copy, 'Gekopieerd');
  } catch {
    flash(ui.copy, 'Kopiëren lukt niet');
  }
});

ui.csv.addEventListener('click', () => {
  const columns = MODES[state.mode].columns.filter((c) => c.csv !== false);
  // Een apostrof voor =, +, - en @ voorkomt dat Excel een cel als formule uitvoert.
  const quote = (value) => `"${String(value ?? '').replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"`;
  const table = [columns.map((c) => c.label), ...visibleRows().map((r) => columns.map((c) => c.text(r)))];
  // Puntkomma en BOM: zo opent Nederlandstalig Excel het bestand direct goed.
  const csv = `﻿${table.map((line) => line.map(quote).join(';')).join('\r\n')}`;
  const link = el('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })),
    download: `leadzoeker-${state.mode}-${new Date().toISOString().slice(0, 10)}.csv` });
  link.click();
  URL.revokeObjectURL(link.href);
  flash(ui.csv, 'Gedownload');
});

for (const button of document.querySelectorAll('.modes button')) button.addEventListener('click', () => setMode(button.dataset.mode));
for (const stop of document.querySelectorAll('[data-stop]')) stop.addEventListener('click', () => state.controller?.abort());
ui.filter.addEventListener('input', render);
$('statusFilter').addEventListener('input', render);

function counter(input, output, one, many, hint) {
  const update = () => {
    const n = lines(input.value).length;
    output.textContent = n ? `${plural(n, one, many)}${n > MAX_ITEMS ? `, dat zijn er ${n - MAX_ITEMS} te veel` : ''}` : hint;
    store.set(`leadzoeker.${input.id}`, input.value);
  };
  input.value = store.get(`leadzoeker.${input.id}`) || '';
  input.addEventListener('input', update);
  update();
}
counter($('sites'), $('siteCount'), 'website', 'websites', `Eén website per regel, maximaal ${MAX_ITEMS}.`);
counter($('emails'), $('emailCount'), 'adres', 'adressen', `Eén adres per regel, maximaal ${MAX_ITEMS}.`);

const startMode = store.get('leadzoeker.mode');
setMode(MODES[startMode] ? startMode : 'scan');
if (state.mode !== 'leads') loadLeads();
