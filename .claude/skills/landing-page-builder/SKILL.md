---
name: landing-page-builder
description: 'Bouwt conversiegerichte, responsive landingspagina''s en productpagina''s (statische HTML/CSS, Shopify Liquid-secties of WordPress-blokken) in de huisstijl. Gebruik voor "maak een landingspagina/productpagina/website".'
---
# Landing page builder
## Structuur (offerte/leadpagina)
1. Hero: belofte + doelgroep + primaire CTA ("Vraag vrijblijvend een offerte aan") + vertrouwen (reviewscore met bron)
2. Problemen/oplossing · 3. Diensten · 4. Werkwijze in 3 stappen · 5. Bewijs (reviews, cases, logo's met toestemming) · 6. FAQ (schema.org FAQPage) · 7. Formulier (naam, bedrijf, e-mail, telefoon, bericht + AVG-toestemmingstekst + link privacyverklaring) · 8. Footer (KvK, adres, privacy, voorwaarden)
## Techniek
- Semantische HTML5, mobile-first CSS (CSS custom properties uit merkkleuren), geen zware frameworks tenzij nodig; afbeeldingen WebP/AVIF met `width/height` en `loading="lazy"`.
- Formulieren: geen secrets in front-end; verwerken via Shopify-formulier, WordPress-plugin of n8n-webhook (zodra gekoppeld).
- Shopify: bouw als Online Store 2.0-sectie; test in een ongepubliceerd thema (`theme_bash`/`theme_screenshot`), publiceren alleen na akkoord.
## Test
Screenshots 390 px en 1440 px (Playwright), Lighthouse ≥ 90 performance/SEO/toegankelijkheid als doel, HTML-validatie, alle links werken.
