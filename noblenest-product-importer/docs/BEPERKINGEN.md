# Bekende beperkingen (versie 0.3 — fase 1 t/m 3)

## Functioneel

| Beperking | Toelichting | Gepland |
|---|---|---|
| Import via losse productlink en handmatige invoer | Nog niet gebouwd (CSV, XML- en JSON-feeds werken wel). | Fase 4 |
| Geen API-koppelingen met marktplaatsen | AliExpress en Alibaba vereisen goedgekeurde API-toegang (App Key/Secret). Temu biedt — voor zover bekend — geen openbare API. Shopify Collective werkt alleen via de Collective-app. Leveranciers met een productfeed (XML/JSON) kun je wél koppelen. | Zodra toegang beschikbaar is |
| Andere XML-formaten | Alleen het Google Merchant Center-formaat (RSS/Atom) wordt herkend; andere XML-structuren eerst laten omzetten of als CSV/JSON aanleveren. | Op aanvraag |
| Feeds automatisch verversen | Een feedbron wordt opgehaald als jij controleert, zoekt of importeert; periodiek ophalen volgt met synchronisatie. | Fase 6 |
| Import loopt binnen het verzoek | Per klik worden maximaal 25 producten verwerkt; daarna *Doorgaan*. Een achtergrondwachtrij (Redis + BullMQ) volgt. | Fase 6 |
| Geen synchronisatie | Voorraad en prijzen worden na de import niet automatisch bijgewerkt. Voorraad wordt in Shopify (nog) niet gevolgd (`tracked: false`). | Fase 6 |
| Status in "Mijn producten" | Toont de status bij import; als je in Shopify publiceert, wordt dat nog niet teruggelezen. | Fase 6 |
| AI-teksten | Alleen opslag en test van API-sleutels; generatie volgt. | Fase 5 |
| Collecties | Producten worden nog niet automatisch aan collecties toegevoegd. | Fase 4 |
| Varianten | Maximaal 3 opties en 2.048 varianten per product (Shopify-limiet); in het antwoord worden maximaal 250 variant-ID's gekoppeld. | — |
| Rate limiting | Nog geen limiet per winkel op uploads/acties (wel uploadgrootte- en regellimieten). | Fase 7 |
| Taal | Alleen Nederlands. | Later |

## Technisch

- **Niet getest in een echte Shopify-winkel.** De app is getest met unit- en integratietests (echte PostgreSQL, gesimuleerde Shopify-API) en met een rooktest van de productie-build met echte Shopify-authenticatie. Installatie en de echte `productSet`-aanroep moeten nog in een ontwikkelwinkel worden gecontroleerd (zie INSTALLATIE.md §7).
- **Afbeeldingen** worden door Shopify zelf van de bron-URL opgehaald; als de leverancier hotlinking blokkeert, meldt Shopify een fout voor dat product.
- **ECB-koersen** vereisen uitgaande internettoegang naar `www.ecb.europa.eu`; zonder toegang alleen handmatige koersen.
- **Feed-URL's** zijn getest met gesimuleerde netwerkantwoorden en een echte undici-verbinding met nep-DNS; ophalen van een echte externe feed kon in de testomgeving niet (geen uitgaand internet) en moet nog met een echte leveranciersfeed worden bevestigd.
- **Producten zoeken** laadt de hele feed in het geheugen (max. 20 MB) en bewaart de catalogus 10 minuten per server-instantie.
- **Kwaliteitscontrole** signaleert ontbrekende gegevens maar is **geen juridisch advies**. Jij blijft verantwoordelijk voor productveiligheid (GPSR), beeldrechten, btw en consumentenrecht.
- Geen capaciteitsgarantie: de architectuur is opgezet voor grote catalogi (batches, indexen, idempotentie), maar grote volumes zijn nog niet onder belasting getest.
- Playwright-end-to-end-tests in de Shopify-admin vereisen een ontwikkelwinkel en volgen in fase 7.
