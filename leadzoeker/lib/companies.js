'use strict';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const USER_AGENT = 'CleanLeadzoeker/1.0 (+https://www.cleanschoonmaakbedrijf.nl)';
const MAX_RESULTS = 200;
const MAX_AREA = 0.6; // graden²: ruim genoeg voor een grote gemeente, te klein voor een heel land

/**
 * Nederlandse zoekwoorden en de bijbehorende categorieën in OpenStreetMap.
 * Een lege waarde betekent: elke waarde van dat kenmerk telt.
 */
const BRANCHES = {
  kantoor: [['office', '']],
  bedrijf: [['office', 'company']],
  tandarts: [['amenity', 'dentist'], ['healthcare', 'dentist']],
  huisarts: [['amenity', 'doctors'], ['healthcare', 'doctor']],
  fysiotherap: [['healthcare', 'physiotherapist']],
  apotheek: [['amenity', 'pharmacy']],
  dierenarts: [['amenity', 'veterinary']],
  kliniek: [['amenity', 'clinic'], ['healthcare', 'clinic']],
  ziekenhuis: [['amenity', 'hospital']],
  zorg: [['amenity', 'nursing_home'], ['amenity', 'social_facility'], ['healthcare', '']],
  verpleeghuis: [['amenity', 'nursing_home'], ['social_facility', 'nursing_home']],
  school: [['amenity', 'school'], ['amenity', 'college']],
  kinderopvang: [['amenity', 'childcare'], ['amenity', 'kindergarten']],
  kinderdagverblijf: [['amenity', 'childcare'], ['amenity', 'kindergarten']],
  universiteit: [['amenity', 'university']],
  hotel: [['tourism', 'hotel']],
  restaurant: [['amenity', 'restaurant']],
  cafe: [['amenity', 'cafe'], ['amenity', 'bar'], ['amenity', 'pub']],
  horeca: [['amenity', 'restaurant'], ['amenity', 'cafe'], ['amenity', 'bar'], ['tourism', 'hotel']],
  sportschool: [['leisure', 'fitness_centre']],
  fitness: [['leisure', 'fitness_centre']],
  zwembad: [['leisure', 'swimming_pool'], ['leisure', 'sports_centre']],
  sport: [['leisure', 'sports_centre'], ['leisure', 'fitness_centre']],
  winkel: [['shop', '']],
  supermarkt: [['shop', 'supermarket']],
  bakker: [['shop', 'bakery']],
  kapper: [['shop', 'hairdresser']],
  schoonheid: [['shop', 'beauty']],
  garage: [['shop', 'car_repair']],
  autobedrijf: [['shop', 'car'], ['shop', 'car_repair']],
  makelaar: [['office', 'estate_agent']],
  advocaat: [['office', 'lawyer']],
  notaris: [['office', 'notary']],
  accountant: [['office', 'accountant']],
  administratiekantoor: [['office', 'accountant'], ['office', 'tax_advisor']],
  architect: [['office', 'architect']],
  verzekering: [['office', 'insurance']],
  uitzendbureau: [['office', 'employment_agency']],
  ict: [['office', 'it']],
  bank: [['amenity', 'bank']],
  bibliotheek: [['amenity', 'library']],
  kerk: [['amenity', 'place_of_worship']],
  theater: [['amenity', 'theatre']],
  bioscoop: [['amenity', 'cinema']],
  museum: [['tourism', 'museum']],
  gemeente: [['amenity', 'townhall'], ['office', 'government']],
  vve: [['office', 'association']],
};

const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/"/g, '');

function filtersFor(keyword) {
  const word = normalize(keyword).replace(/\s+/g, '');
  const filters = [];
  for (const [key, list] of Object.entries(BRANCHES)) {
    if (word.includes(key) || (word.length >= 4 && key.startsWith(word))) filters.push(...list);
  }
  return filters;
}

function buildQuery(keyword, box) {
  const area = `(${box.south},${box.west},${box.north},${box.east})`;
  const parts = filtersFor(keyword).map(([key, value]) => `nwr["${key}"${value ? `="${value}"` : ''}]${area};`);
  parts.push(`nwr["name"~"${escapeRegex(normalize(keyword))}",i]${area};`);
  return `[out:json][timeout:25];(${parts.join('')});out tags ${MAX_RESULTS * 3};`;
}

function tidyWebsite(value) {
  if (!value) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (/(^|\.)(facebook|instagram|linkedin|twitter|x)\.com$/.test(url.hostname)) return '';
    return url.host.replace(/^www\./, '');
  } catch {
    return '';
  }
}

async function getJson(url, init, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(40_000), headers: { 'user-agent': USER_AGENT, ...init?.headers } });
  } catch {
    throw new Error('De bedrijvenzoeker is niet bereikbaar. Controleer je internetverbinding.');
  }
  if (response.status === 429 || response.status === 504) throw new Error('De kaartdienst is druk. Probeer het over een minuut opnieuw.');
  if (!response.ok) throw new Error(`De kaartdienst gaf een fout (${response.status}).`);
  return response.json();
}

/**
 * Zoekt bedrijven op zoekwoord en plaats in OpenStreetMap, de open kaart
 * waar bedrijven en vrijwilligers zelf hun gegevens op zetten.
 */
async function searchCompanies({ keyword, place }, options = {}) {
  const { fetchImpl = fetch, nominatim = NOMINATIM, overpass = OVERPASS } = options;
  if (normalize(keyword).length < 2) throw new Error('Vul een zoekwoord in, bijvoorbeeld tandarts of kantoor.');
  if (normalize(place).length < 2) throw new Error('Vul een plaats in, bijvoorbeeld Zeist.');

  const geoUrl = `${nominatim}?${new URLSearchParams({ q: String(place).trim(), countrycodes: 'nl,be', format: 'jsonv2', limit: '1' })}`;
  const [hit] = await getJson(geoUrl, {}, fetchImpl);
  if (!hit?.boundingbox) throw new Error(`De plaats "${String(place).trim()}" is niet gevonden.`);
  const [south, north, west, east] = hit.boundingbox.map(Number);
  if ((north - south) * (east - west) > MAX_AREA) throw new Error('Dit gebied is te groot. Kies een plaats of gemeente.');

  const data = await getJson(overpass, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(buildQuery(keyword, { south, north, west, east }))}`,
  }, fetchImpl);

  const seen = new Set();
  const companies = [];
  for (const element of data.elements || []) {
    const tags = element.tags || {};
    if (!tags.name) continue;
    const website = tidyWebsite(tags.website || tags['contact:website'] || tags.url);
    const key = website || normalize(tags.name);
    if (seen.has(key)) continue;
    seen.add(key);
    companies.push({
      name: tags.name,
      website,
      email: (tags.email || tags['contact:email'] || '').toLowerCase(),
      phone: tags.phone || tags['contact:phone'] || '',
      address: [[tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' '), tags['addr:city']].filter(Boolean).join(', '),
    });
    if (companies.length >= MAX_RESULTS) break;
  }
  companies.sort((a, b) => Number(Boolean(b.website)) - Number(Boolean(a.website)) || a.name.localeCompare(b.name));
  return { place: hit.display_name?.split(',')[0] || String(place).trim(), known: filtersFor(keyword).length > 0, companies };
}

module.exports = { searchCompanies, buildQuery, filtersFor, BRANCHES };
