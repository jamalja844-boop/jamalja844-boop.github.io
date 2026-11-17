// Bouwt CLEAN-banners voor alle kanalen vanuit één ontwerp. Gebruik: node banner/build-banners.js
const { chromium } = require('playwright');
const path = require('path');
const sizes = [
  // name, W, H, safe box (zone die op alle apparaten zichtbaar blijft)
  { name: 'facebook-cover', W: 1640, H: 624, sx: 265, sy: 40, sw: 1110, sh: 544 },
  { name: 'youtube-banner', W: 2560, H: 1440, sx: 507, sy: 508, sw: 1546, sh: 423 },
  { name: 'linkedin-banner', W: 1584, H: 396, sx: 380, sy: 24, sw: 1180, sh: 348 },
];
const html = s => {
  const logoW = Math.min(0.5 * s.sw, s.sh * 1.05);
  const full = s.sh / s.H > 0.7;
  const px = s.sx + 0.5 * s.sw;
  const pTop = full ? 0 : s.sy - 0.15 * s.sh, pH = full ? s.H : s.sh * 1.3;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}
body{width:${s.W}px;height:${s.H}px;overflow:hidden;font-family:Inter,Arial,sans-serif;position:relative;
background:radial-gradient(circle at 0% 0%,#dceef8 0,rgba(220,238,248,0) 45%),radial-gradient(circle at 100% 100%,#dceef8 0,rgba(220,238,248,0) 50%),#fff}
.photo{position:absolute;left:${px}px;top:${pTop}px;width:${full ? s.W - px : s.sx + s.sw * 1.04 - px}px;height:${pH}px;background:url(f9.png) 75% 45%/cover;
-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 30%${full ? '' : ',#000 94%,transparent 100%'})${full ? '' : ',linear-gradient(180deg,transparent 0,#000 18%,#000 82%,transparent 100%)'};
-webkit-mask-composite:source-in;mask-composite:intersect}
.safe{position:absolute;left:${s.sx}px;top:${s.sy}px;width:${s.sw * 0.56}px;height:${s.sh}px;display:flex;flex-direction:column;justify-content:center;padding-left:${s.sw * 0.02}px}
.logo{width:${logoW}px;margin-left:-${logoW * 0.04}px}
.slogan{font-weight:800;color:#16507c;font-size:${s.sh * 0.075}px;margin-top:${s.sh * 0.04}px}
.svc{font-weight:600;color:#5d6b78;font-size:${s.sh * 0.042}px;margin-top:${s.sh * 0.02}px}
.contact{display:flex;gap:${s.sh * 0.03}px;margin-top:${s.sh * 0.06}px;font-weight:700;font-size:${s.sh * 0.046}px;white-space:nowrap}
.pill{background:#16507c;color:#fff;padding:${s.sh * 0.022}px ${s.sh * 0.045}px;border-radius:99px}
.web{color:#16507c;border:2px solid #16507c;padding:${s.sh * 0.018}px ${s.sh * 0.04}px;border-radius:99px;background:#fff}
</style></head><body><div class="photo"></div>
<div class="safe"><img class="logo" src="clean-logo.png">
<div class="slogan">Altijd schoon, altijd klaar.</div>
<div class="svc">Kantoor · Glasbewassing · Vloeren · VvE · Horeca</div>
<div class="contact"><span class="pill">030-237 80 37</span><span class="web">cleanschoonmaakbedrijf.nl</span></div>
</div></body></html>`;
};
(async () => {
  const b = await chromium.launch();
  for (const s of sizes) {
    const p = await b.newPage({ viewport: { width: s.W, height: s.H } });
    await p.goto('file://' + path.join(__dirname, 'blank.html'));
    await p.setContent(html(s), { waitUntil: 'load' });
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(__dirname, s.name + '.png') });
    console.log('ok', s.name);
  }
  await b.close();
})();
