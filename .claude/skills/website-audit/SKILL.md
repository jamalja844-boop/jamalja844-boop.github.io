---
name: website-audit
description: 'Voert een technische website-audit uit (performance/Core Web Vitals, SEO, toegankelijkheid, mobiel, conversie, beveiligingsheaders) en levert een geprioriteerd verbeterrapport. Gebruik voor "analyseer/verbeter mijn website", Shopify- of WordPress-checks en foutopsporing.'
---
# Website audit
1. **Crawl**: Firecrawl `firecrawl_scrape` (markdown + links) of OpenRush `audit_site` / `inspect_page`.
2. **Performance**: lokaal Lighthouse/Playwright met Chromium `/opt/pw-browsers/chromium` (`--headless --no-sandbox`), mobiel + desktop. Noteer LCP, INP, CLS, TTFB, paginagewicht.
3. **SEO**: title (≤ 60), meta description (≤ 155), één H1, heading-hiërarchie, canonical, `lang`, Open Graph, schema.org (LocalBusiness / Product / Organization), sitemap.xml, robots.txt, alt-teksten, interne links.
4. **Toegankelijkheid** (WCAG 2.2 AA): contrast, focus, labels, toetsenbordnavigatie (axe-core indien beschikbaar).
5. **Conversie**: CTA boven de vouw, telefoon/WhatsApp-knop, offerteformulier ≤ 5 velden, vertrouwen (reviews, KvK, keurmerken), laadtijd.
6. **Beveiliging**: HTTPS, HSTS, CSP, X-Content-Type-Options, verouderde scripts.
7. Rapport: `reports/website/<datum>-<domein>.md` — tabel `bevinding | impact (hoog/midden/laag) | inspanning | oplossing`, gesorteerd op impact/inspanning.
