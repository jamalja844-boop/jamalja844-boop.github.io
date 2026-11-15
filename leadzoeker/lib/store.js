'use strict';

const fs = require('node:fs');
const path = require('node:path');

const STATUSES = ['nieuw', 'benaderd', 'in gesprek', 'klant', 'niet interessant'];
const text = (value, max = 200) => String(value ?? '').trim().slice(0, max);

/** Het eigen leadbestand: één JSON-bestand op de computer van de gebruiker. */
class LeadStore {
  constructor(file) {
    this.file = file;
    this.leads = new Map();
    try {
      for (const lead of JSON.parse(fs.readFileSync(file, 'utf8'))) this.leads.set(lead.email, lead);
    } catch { /* nog geen bestand: begin leeg */ }
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify([...this.leads.values()], null, 2));
    fs.renameSync(temp, this.file); // in één stap vervangen, zodat een crash het bestand niet beschadigt
  }

  list() {
    return [...this.leads.values()].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  }

  /** Voegt toe of vult aan; een bestaande status en notitie blijven staan. */
  upsert(items) {
    let added = 0;
    for (const item of items) {
      const email = text(item.email, 120).toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(email)) continue;
      const existing = this.leads.get(email);
      if (!existing) added += 1;
      this.leads.set(email, {
        email,
        name: text(item.name) || existing?.name || '',
        site: text(item.site) || existing?.site || '',
        type: text(item.type, 20) || existing?.type || '',
        verdict: text(item.verdict, 20) || existing?.verdict || '',
        status: existing?.status || 'nieuw',
        addedAt: existing?.addedAt || new Date().toISOString(),
      });
    }
    this.save();
    return added;
  }

  setStatus(email, status) {
    const lead = this.leads.get(email);
    if (!lead || !STATUSES.includes(status)) return false;
    lead.status = status;
    this.save();
    return true;
  }

  remove(emails) {
    let removed = 0;
    for (const email of emails) if (this.leads.delete(email)) removed += 1;
    this.save();
    return removed;
  }
}

module.exports = { LeadStore, STATUSES };
