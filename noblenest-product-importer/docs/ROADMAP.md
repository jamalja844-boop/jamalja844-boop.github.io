# Roadmap en status

| Fase | Inhoud | Status |
|---|---|---|
| **1 — Analyse en setup** | Officieel Shopify-sjabloon, PostgreSQL + Prisma (15 modellen), Docker Compose, configuratie, architectuur | ✅ Gereed |
| **2 — Werkende basisapp** | Authenticatie, dashboard, instellingen (versleutelde sleutels), prijsregels + calculator, CSV-import met voorbeeld, conceptimport via productSet, duplicaatpreventie, logboek, compliancewebhooks, tests | ✅ Gereed (in ontwikkelwinkel nog te verifiëren) |
| **3 — Leveranciersintegraties** | Adapterinterface; XML/JSON-feeds; AliExpress (Open Platform) en Alibaba waar API-toegang beschikbaar is; verbindingscontrole; Producten zoeken | ⏳ Volgende |
| **4 — Productbeheer** | URL-import (alleen geautoriseerde bronnen, SSRF-beveiligd), productvoorbeeld bewerken, afbeeldingenbeheer (volgorde, hoofdfoto, duplicaten, afmetingen), collecties, handmatige invoer, duplicatenoverzicht | Gepland |
| **5 — AI en prijzen** | AI Studio (Claude/OpenAI): titels, beschrijvingen, vertaling, SEO, tags, alt-teksten, ontbrekende info; zonder verzonnen claims; originele data apart | Gepland |
| **6 — Bulk en synchronisatie** | Redis + BullMQ, wachtrij met pauzeren/hervatten, Shopify Bulk Operations, voorraad- en prijssynchronisatie met goedgekeurde regels, statusterugkoppeling | Gepland |
| **7 — Testen en afwerken** | Playwright-E2E in ontwikkelwinkel, rate limiting, belasting- en beveiligingstest, toegankelijkheid | Gepland |

## Acceptatiecriteria — stand van zaken

| Criterium | Stand |
|---|---|
| Installeerbaar in een Shopify-ontwikkelwinkel | Configuratie gereed; installatie door jou te bevestigen (Dev Dashboard-login nodig) |
| Dashboard werkt | ✅ (rooktest productie-build) |
| CSV bekijken en als concept importeren | ✅ (integratietests; echte Shopify-aanroep nog te bevestigen in ontwikkelwinkel) |
| Eén echte leveranciersintegratie end-to-end | ⏳ Fase 3 — vereist API-toegang van een leverancier |
| Varianten en afbeeldingen correct | ✅ getest |
| Prijsberekening aantoonbaar correct | ✅ 16 unit-tests + integratietests |
| Duplicaten voorkomen | ✅ getest (ook na netwerkfout) |
| AI-functies met geldige sleutel | ⏳ Fase 5 (sleutelopslag en verbindingstest gereed) |
| Fouten duidelijk zichtbaar | ✅ per regel, per product en in het logboek |
| Geen publicatie zonder goedkeuring | ✅ altijd DRAFT, geen publicatiefunctie |
| Tests slagen | ✅ 59/59 |
| Installatiehandleiding volledig | ✅ |
