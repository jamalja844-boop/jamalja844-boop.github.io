# Test-audit lokale site — 2026-11-25 (website-designer)

Scope: `index.html`, `privacy.html`, `terms.html` (lokaal, via file://). Niets gepubliceerd of gepusht.

## Bevindingen
- **SEO**: geen `meta description`, geen canonical, geen Open Graph, geen schema.org, geen `robots.txt`/`sitemap.xml`. Titles kort en uniek (OK). Eén H1 per pagina (OK). `lang="en"` aanwezig.
- **Toegankelijkheid**: geen landmarks (`<main>`, `<header>`, `<footer>`/`<nav>`); links alleen onderscheiden door kleur (`text-decoration:none`, WCAG 1.4.1-risico). Linkkleur #1a73e8 op wit ≈ 4.5:1 (net voldoende). Geen expliciete `:focus-visible`-stijl.
- **Mobiel**: viewport-meta aanwezig; screenshot 390 px (`reports/tests/index-mobile.png`) toont geen horizontale scroll (scrollWidth = 390). H1 van 56 px is groot op mobiel (neemt veel van het scherm in).
- **Links**: interne links (terms, privacy, mailto, tel) aanwezig en verwijzen naar bestaande bestanden.
- **Shopify**: `get-shop-info` werkt (alleen lezen) — winkel NobleNest, noblenest.nl, plan Basic, EUR, NL.

## Top-5 verbeterpunten
| # | Bevinding | Impact | Inspanning | Oplossing |
|---|---|---|---|---|
| 1 | Geen meta description / OG-tags | hoog | laag | `<meta name="description">` (≤155 tekens) + `og:title/description/url` per pagina |
| 2 | Geen robots.txt en sitemap.xml, geen canonical | midden | laag | Beide bestanden toevoegen; `<link rel="canonical">` per pagina |
| 3 | Links alleen herkenbaar aan kleur | midden | laag | Onderstreping standaard tonen + duidelijke `:focus-visible`-outline |
| 4 | Geen semantische landmarks | midden | laag | Inhoud in `<main>`, juridische links in `<nav>`/`<footer>` |
| 5 | H1 56 px te groot op mobiel | laag | laag | `font-size: clamp(2rem, 8vw, 3.5rem)` |

Opmerking: performance (Lighthouse/CWV) niet gemeten in deze test; pagina's zijn klein (≈1–1,6 kB, geen externe resources).
