// Bouwt luxe CLEAN-banners voor alle kanalen vanuit één ontwerp.
// Gebruik: node banner/build-banners.js
const { chromium } = require('playwright');
const path = require('path');

// safe box = zone die op alle apparaten zichtbaar blijft; mirror = foto links, tekst rechts
const sizes = [
  { name: 'facebook-cover', W: 1640, H: 624, sx: 265, sy: 40, sw: 1110, sh: 544 },
  { name: 'youtube-banner', W: 2560, H: 1440, sx: 507, sy: 508, sw: 1546, sh: 423 },
  { name: 'x-banner', W: 1500, H: 500, sx: 60, sy: 50, sw: 1380, sh: 400, mirror: true },
  { name: 'linkedin-banner', W: 1584, H: 396, sx: 380, sy: 24, sw: 1180, sh: 348 },
];

const ACCENT = '#6ebeeb';

const html = s => {
  const full = s.sh / s.H > 0.7;
  const k = s.sh / 100; // schaal-eenheid
  const logoW = Math.min(0.46 * s.sw, s.sh * 1.0);
  const colW = s.sw * 0.55;
  // foto-zone
  let pL, pW;
  if (s.mirror) { pL = 0; pW = s.sx + s.sw * 0.5; }
  else { pL = s.sx + s.sw * 0.44; pW = (full ? s.W : s.sx + s.sw * 1.04) - pL; }
  const pTop = full ? 0 : s.sy - 0.12 * s.sh, pH = full ? s.H : s.sh * 1.24;
  const fadeDir = s.mirror ? '270deg' : '90deg';
  const colLeft = s.mirror ? s.sx + s.sw - colW : s.sx;
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;1,500&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;box-sizing:border-box}
body{width:${s.W}px;height:${s.H}px;overflow:hidden;position:relative;font-family:Inter,Arial,sans-serif;
background:radial-gradient(ellipse at ${s.mirror ? '75%' : '25%'} 40%,#173a63 0,#0d2340 45%,#081629 100%)}
.photo{position:absolute;left:${pL}px;top:${pTop}px;width:${pW}px;height:${pH}px;
background:linear-gradient(180deg,rgba(8,22,41,.15),rgba(8,22,41,.35)),url(lux-photo.png) ${s.mirror ? '22%' : '20%'} 40%/cover;
-webkit-mask-image:linear-gradient(${fadeDir},transparent 0,#000 35%${full ? '' : ',#000 94%,transparent 100%'})${full ? '' : ',linear-gradient(180deg,transparent 0,#000 15%,#000 85%,transparent 100%)'};
-webkit-mask-composite:source-in;mask-composite:intersect}
.col{position:absolute;left:${colLeft}px;top:${s.sy}px;width:${colW}px;height:${s.sh}px;display:flex;flex-direction:column;justify-content:center;
align-items:${s.mirror ? 'flex-end' : 'flex-start'};padding-${s.mirror ? "right" : "left"}:${s.sw * 0.03}px;text-align:${s.mirror ? 'right' : 'left'}}
.logo{width:${logoW}px;filter:drop-shadow(0 ${k * 0.6}px ${k * 1.5}px rgba(0,0,0,.35))}
.rule{width:${k * 16}px;height:${Math.max(2, k * 0.35)}px;background:linear-gradient(90deg,${s.mirror ? 'transparent,' + ACCENT : ACCENT + ',transparent'});margin:${k * 3.2}px 0 ${k * 2.6}px}
.slogan{font-family:'Playfair Display',Georgia,serif;font-style:italic;font-weight:500;color:#fff;font-size:${k * 7.6}px;line-height:1.1}
.svc{color:${ACCENT};font-weight:500;font-size:${k * 3.3}px;letter-spacing:${k * 0.55}px;text-transform:uppercase;margin-top:${k * 2.2}px}
.contact{display:flex;gap:${k * 2.6}px;margin-top:${k * 5}px;align-items:center;white-space:nowrap;font-size:${k * 4.1}px;font-weight:600}
.pill{color:#0b1a2e;background:#ffffff;padding:${k * 1.8}px ${k * 4}px;border-radius:99px;letter-spacing:${k * 0.15}px}
.web{color:#e9eef4;font-weight:500;letter-spacing:${k * 0.1}px}
</style></head><body><div class="photo"></div>
<div class="col"><img class="logo" src="clean-logo-lux.png"><div class="rule"></div>
<div class="slogan">Altijd schoon, altijd klaar.</div>
<div class="svc">Kantoor · Glas · Vloeren · VvE · Horeca</div>
<div class="contact">${s.mirror ? '<span class="web">cleanschoonmaakbedrijf.nl</span><span class="pill">030-237 80 37</span>' : '<span class="pill">030-237 80 37</span><span class="web">cleanschoonmaakbedrijf.nl</span>'}</div>
</div></body></html>`;
};

(async () => {
  const b = await chromium.launch();
  for (const s of sizes) {
    const p = await b.newPage({ viewport: { width: s.W, height: s.H } });
    await p.goto('file://' + path.join(__dirname, 'blank.html'));
    await p.setContent(html(s), { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(__dirname, s.name + '.png') });
    console.log('ok', s.name);
  }
  await b.close();
})();
