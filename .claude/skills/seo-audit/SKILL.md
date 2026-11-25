---
name: seo-audit
description: "Vaste structuur voor SEO-audits en zoekwoordonderzoek (technisch, on-page, content, concurrentie) met live data uit Semrush/OpenRush en kostenbewust gebruik. Gebruik voor vindbaarheid, rankings, zoekwoorden, meta-titels en SEO-verbeteringen van website of webshop."
---
# SEO-audit

## Stappen
1. **Scope:** domein/URL's, markt (standaard Nederland, Semrush database `nl`), doelen.
2. **Gratis eerst:** haal de pagina op (WebFetch of `curl -s`) en controleer titel, meta description, H1-H3, canonical, robots, alt-teksten, structured data, interne links.
3. **Live data (betaald, klein houden):** zoekwoorden (volume, KD, intentie) en concurrenten met `display_limit` 10-30.
4. **Prioriteren:** impact x moeite.

## Rapport
```
## Samenvatting (3 bullets)
## Technisch      | Check | Status | Actie |
## On-page        | Pagina | Huidige titel/meta | Voorstel (<=60 / <=155 tekens) |
## Zoekwoorden    | Zoekwoord | Volume | KD | Intentie | Doelpagina |
## Concurrentie   | Domein | Sterkte | Kans |
## Actieplan      | Prio | Actie | Agent | Moeite |
## Bronnen & kosten (welke betaalde rapporten, hoeveel rijen)
```
Geen cijfers zonder bron; ontbrekende data = `[GEEN DATA]`.
