// Bouwt strakke, zakelijke CLEAN-banners (donkerblauw, blauw, wit) voor alle kanalen.
// Gebruik: node banner/build-banners.js
const { chromium } = require('playwright');
const path = require('path');

// safe box = zone die op alle apparaten zichtbaar blijft
const sizes = [
  { name: 'facebook-cover', W: 1640, H: 624, sx: 265, sy: 60, sw: 1110, sh: 504 },
  { name: 'youtube-banner', W: 2560, H: 1440, sx: 507, sy: 508, sw: 1546, sh: 423 },
  { name: 'x-banner', W: 1500, H: 500, sx: 400, sy: 60, sw: 1060, sh: 380 },
  { name: 'linkedin-banner', W: 1584, H: 396, sx: 380, sy: 30, sw: 1160, sh: 336 },
];

const ACCENT = '#6ebeeb';

const html = s => {
  const k = s.sh / 100;
  const logoW = Math.min(0.4 * s.sw, s.sh * 1.05);
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;box-sizing:border-box}
body{width:${s.W}px;height:${s.H}px;overflow:hidden;position:relative;font-family:Inter,Arial,sans-serif;
background:linear-gradient(120deg,#081a33 0%,#0c2648 48%,#0f3160 100%)}
.tex{position:absolute;inset:0;background:repeating-linear-gradient(135deg,rgba(255,255,255,.022) 0 1px,transparent 1px ${Math.round(k * 4)}px)}
.sheen{position:absolute;inset:0;background:radial-gradient(ellipse 60% 90% at 50% 50%,rgba(110,190,235,.13),transparent 70%)}
.arc{position:absolute;border:1px solid rgba(110,190,235,.16);border-radius:50%}
.line{position:absolute;left:0;right:0;bottom:0;height:${Math.max(3, k * 0.9)}px;background:linear-gradient(90deg,transparent,${ACCENT} 30%,#1e7fc1 70%,transparent)}
.wrap{position:absolute;left:${s.sx}px;top:${s.sy}px;width:${s.sw}px;height:${s.sh}px;display:flex;align-items:center;justify-content:center;gap:${k * 7}px}
.logo{width:${logoW}px;filter:drop-shadow(0 ${k * 0.8}px ${k * 2}px rgba(0,0,0,.35))}
.div{width:1px;height:${k * 62}px;background:linear-gradient(180deg,transparent,rgba(255,255,255,.45),transparent)}
.col{display:flex;flex-direction:column;align-items:flex-start}
.slogan{color:#fff;font-weight:600;font-size:${k * 7.4}px;letter-spacing:-${k * 0.1}px;line-height:1.1}
.svc{color:${ACCENT};font-weight:500;font-size:${k * 3.1}px;letter-spacing:${k * 0.6}px;text-transform:uppercase;margin-top:${k * 3}px}
.contact{display:flex;gap:${k * 3}px;margin-top:${k * 6}px;align-items:center;white-space:nowrap;font-size:${k * 3.9}px}
.pill{color:#0b1f3a;background:#fff;font-weight:700;padding:${k * 1.7}px ${k * 3.8}px;border-radius:99px;letter-spacing:${k * 0.12}px}
.web{color:#fff;font-weight:400;letter-spacing:${k * 0.12}px;opacity:.92}
</style></head><body>
<div class="tex"></div><div class="sheen"></div>
<div class="arc" style="width:${s.H * 1.6}px;height:${s.H * 1.6}px;right:-${s.H * 0.55}px;top:-${s.H * 0.9}px"></div>
<div class="arc" style="width:${s.H * 1.25}px;height:${s.H * 1.25}px;right:-${s.H * 0.35}px;top:-${s.H * 0.7}px"></div>
<div class="line"></div>
<div class="wrap"><img class="logo" src="clean-logo-lux.png"><div class="div"></div>
<div class="col"><div class="slogan">Altijd schoon,<br>altijd klaar.</div>
<div class="svc">Kantoor · Glas · Vloeren · VvE · Horeca</div>
<div class="contact"><span class="pill">030-237 80 37</span><span class="web">cleanschoonmaakbedrijf.nl</span></div></div>
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
