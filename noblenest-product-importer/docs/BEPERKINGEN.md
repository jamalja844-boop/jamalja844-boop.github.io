# Bekende beperkingen (versie 0.2 — fase 1 + 2)

## Functioneel

| Beperking | Toelichting | Gepland |
|---|---|---|
| Alleen CSV-import | XML/JSON-feeds, handmatige invoer en URL-import zijn nog niet gebouwd. | Fase 3–4 |
| Geen leverancierskoppelingen | AliExpress en Alibaba vereisen goedgekeurde API-toegang (App Key/Secret) van de leverancier. Temu biedt — voor zover bekend — geen openbare API. Shopify Collective werkt alleen via de Collective-app in je Shopify-admin. | Fase 3 (waar toegang mogelijk is) |
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
- **Kwaliteitscontrole** signaleert ontbrekende gegevens maar is **geen juridisch advies**. Jij blijft verantwoordelijk voor productveiligheid (GPSR), beeldrechten, btw en consumentenrecht.
- Geen capaciteitsgarantie: de architectuur is opgezet voor grote catalogi (batches, indexen, idempotentie), maar grote volumes zijn nog niet onder belasting getest.
- Playwright-end-to-end-tests in de Shopify-admin vereisen een ontwikkelwinkel en volgen in fase 7.
