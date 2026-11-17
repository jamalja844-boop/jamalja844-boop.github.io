// Genereert Instagram/Facebook Story-kaarten (1080x1920) voor CLEAN Schoonmaakbedrijf B.V.
// Gebruik: node stories/build.js
const { chromium } = require('playwright');
const path = require('path');

const stories = [
  { file: 'test', tag: 'Welkom', title: 'Elke dag een kijkje bij CLEAN.', body: 'Vanaf vandaag delen we hier ons werk: ons team, onze klussen en wat er achter de schermen gebeurt.', cta: 'Volg ons en kijk mee', sticker: false },
  { file: 'di-p', tag: 'Ons team', title: 'Achter elke schone werkplek staat een vakkundig team.', body: 'Onze medewerkers zorgen dagelijks voor schone kantoren, trappenhuizen en bedrijfsruimtes. Zorgvuldig en op afspraak.', cta: 'Stel je vraag aan ons team', sticker: true },
  { file: 'di-v', tag: 'Glasbewassing', title: 'Wanneer zijn jouw ramen voor het laatst gewassen?', body: 'Schone ramen geven meer licht en een verzorgde uitstraling. Wij wassen glas voor bedrijven, VvE’s en particulieren, eenmalig of periodiek.', cta: 'Stuur ons een bericht voor een prijsindicatie', sticker: true },
  { file: 'wo-p', tag: 'Achter de schermen', title: 'Wat zit er eigenlijk in onze werkwagen?', body: 'Van microvezeldoek tot schrobmachine: goed materiaal maakt het verschil. Hiermee gaan wij elke dag op pad.', cta: 'Doe een gok in de quiz', sticker: true },
  { file: 'wo-v', tag: 'Vloeronderhoud', title: 'Vloeren krijgen dagelijks veel te verduren.', body: 'Met periodiek onderhoud blijven ze langer mooi en gaan ze langer mee. Wij adviseren welk onderhoud bij jouw vloer past.', cta: 'Vraag advies voor jouw vloer aan', sticker: true },
  { file: 'do-p', tag: 'Resultaat', title: 'Voor en na, zonder filter.', body: 'Deze week hebben we weer heel wat ruimtes onder handen genomen. Voor dit soort resultaten doen we het.', cta: 'Laat weten wat je ervan vindt', sticker: true },
  { file: 'do-v', tag: 'Voor VvE’s', title: 'Het trappenhuis is het visitekaartje van elk gebouw.', body: 'Wij reinigen trappenhuizen, entrees en liften volgens een vaste planning. Bewoners merken het verschil.', cta: 'Vraag een voorstel op maat aan', sticker: true },
  { file: 'vr-p', tag: 'Tip van de vakman', title: 'Werk van boven naar beneden.', body: 'En van schoon naar vuil. Zo valt stof nooit op een plek die je al hebt gedaan, en hoef je niets twee keer te doen.', cta: 'Stuur deze tip door', sticker: true },
  { file: 'vr-v', tag: 'Dieptereiniging', title: 'Sommige plekken vragen om meer dan een gewone beurt.', body: 'Keuken, sanitair of een ruimte die lang niet is aangepakt: met een dieptereiniging maken we grondig schoon, tot in de hoeken.', cta: 'Stuur ons een foto, we denken mee', sticker: true },
  { file: 'za-p', tag: 'Terugblik', title: 'Dank voor het vertrouwen.', body: 'Kantoren, trappenhuizen en opleveringen: het was een mooie week. Dank aan ons team en aan onze klanten.', cta: 'Fijn weekend!', sticker: true },
  { file: 'za-v', tag: 'Opleverschoonmaak', title: 'Sleuteloverdracht in zicht?', body: 'Na een verbouwing, verhuizing of nieuwbouw zorgen wij dat het pand schoon wordt opgeleverd. Stofvrij en klaar voor gebruik.', cta: 'Geef je opleverdatum door', sticker: true },
  { file: 'zo-p', tag: 'Vragendag', title: 'Wat wil jij weten over ons werk?', body: 'Over ons team, onze werkwijze of schoonmaken in het algemeen: stel je vraag en wij beantwoorden die komende week.', cta: 'Stel hier je vraag', sticker: true },
  { file: 'zo-v', tag: 'Werkgebied', title: 'Nieuwe week, nog ruimte in de planning.', body: 'Wij werken in Zeist, Utrecht en omgeving, en ook daarbuiten. Zoek je een betrouwbare schoonmaakpartner? We denken graag mee.', cta: 'Vraag een vrijblijvende offerte aan', sticker: true },
  { file: 'ma-p', tag: 'Maandag', title: 'Goedemorgen! Zo begint onze week.', body: 'De bussen zijn geladen en het team is onderweg. Deze week staan er weer kantoren, trappenhuizen en opleveringen op de planning.', cta: 'Hoe is jouw maandag begonnen?', sticker: true },
  { file: 'ma-v', tag: 'Kantoorschoonmaak', title: 'Zo hoort een werkweek te beginnen.', body: 'Een schoon kantoor werkt prettiger, voor collega’s én bezoekers. Wij verzorgen de schoonmaak afgestemd op jullie werktijden.', cta: 'Vraag vrijblijvend een offerte aan', sticker: true },
];

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const html = s => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
<style>
*{margin:0;box-sizing:border-box}
body{width:1080px;height:1920px;font-family:Inter,Arial,sans-serif;color:#0b2a3c;
background:linear-gradient(165deg,#e8f6fb 0%,#ffffff 55%,#d6eef7 100%);position:relative;overflow:hidden}
.wave{position:absolute;right:-220px;top:-220px;width:760px;height:760px;border-radius:50%;background:#0a7fb0;opacity:.10}
.wave2{position:absolute;left:-260px;bottom:-300px;width:820px;height:820px;border-radius:50%;background:#18b3a8;opacity:.10}
.wrap{position:absolute;inset:250px 96px 260px 96px;display:flex;flex-direction:column}
.logo{font-weight:800;font-size:64px;letter-spacing:10px;color:#0a7fb0}
.logo small{display:block;font-size:24px;letter-spacing:4px;font-weight:600;color:#4a6b7c;margin-top:6px}
.tag{margin-top:120px;align-self:flex-start;background:#0a7fb0;color:#fff;font-weight:600;font-size:34px;padding:14px 32px;border-radius:40px}
h1{margin-top:44px;font-size:${s.title.length > 40 ? 84 : 96}px;line-height:1.08;font-weight:800;letter-spacing:-1px}
p{margin-top:44px;font-size:42px;line-height:1.45;color:#28495a}
.space{flex:1}
.cta{align-self:flex-start;background:#0b2a3c;color:#fff;font-size:36px;font-weight:600;padding:24px 40px;border-radius:18px}
</style></head><body><div class="wave"></div><div class="wave2"></div>
<div class="wrap">
<div class="logo">CLEAN<small>SCHOONMAAKBEDRIJF B.V.</small></div>
<div class="tag">${esc(s.tag)}</div>
<h1>${esc(s.title)}</h1>
<p>${esc(s.body)}</p>
<div class="space"></div>
<div class="cta">${esc(s.cta)}</div>
</div></body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  for (const s of stories) {
    await page.setContent(html(s), { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(__dirname, `${s.file}.png`) });
    console.log('ok', s.file);
  }
  await browser.close();
})();
