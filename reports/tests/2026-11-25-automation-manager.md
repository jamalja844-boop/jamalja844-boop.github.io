# Testrapport automation-manager — 2026-11-25

Type: TEST-OPDRACHT, alleen lezen. Geen mutaties, geen geplande taken aangemaakt.
Workflow: `workflows/shopify-orders.yaml`, stappen s1 + s2 (s3/s4 niet uitgevoerd).

## 1. Shopify (NobleNest, noblenest.nl) — controledatum 2026-11-25

Winkel: NobleNest, plan Basic, valuta EUR, tijdzone CET (via `get-shop-info`).

### s1 — Bestellingen laatste 7 dagen (vanaf 2026-11-18)
Query: `orders(query: "created_at:>=2026-11-18")` met `displayFinancialStatus`, `displayFulfillmentStatus`.

| Kengetal | Waarde |
|---|---|
| Aantal bestellingen (7 dagen) | 0 |
| Financiële status | n.v.t. (geen bestellingen) |
| Fulfilment-status | n.v.t. (geen bestellingen) |
| Controle: `ordersCount` (totaal zichtbaar) | 0 |

Toelichting: de koppeling werkt (query zonder fouten), maar er zijn geen bestellingen zichtbaar. Ook `ordersCount` totaal is 0. Mogelijke oorzaken: de winkel heeft nog geen bestellingen, of de app-scope geeft alleen recente bestellingen terug (standaard laatste 60 dagen zonder `read_all_orders`). Niet verder te verifiëren via deze koppeling.

Afwijking t.o.v. workflow: s1 is in de YAML gedefinieerd als "laatste 24 u"; voor deze test is op verzoek 7 dagen gebruikt.

### s2 — Lage voorraad (< 3 stuks)
Query: `productVariants(query: "inventory_quantity:<3")`.

| Kengetal | Waarde |
|---|---|
| Varianten met voorraad < 3 | 0 |
| Totaal producten (`productsCount`) | 140 |
| Laagste voorraad (controle, gesorteerd op `INVENTORY_QUANTITY`) | 20 stuks (meerdere actieve producten, voorraadbeheer aan) |

Conclusie s2: geen lage-voorraadsignalen.

## 2. Google Drive — 'Clean AI Belassistent CRM' (structuur)

Bestand: Google Sheet, ID `19uiq7ka0hTW-qsWPV0F9-8dpWxVwt-lvtZpU8JJYToU`, laatst gewijzigd 2026-11-09.
Rechten via connector: `canEdit: false`, `canMoveItemWithinDrive: false`, `canTrash: false` (alleen lezen mogelijk).

Let op (privacy): de Drive-leesfunctie retourneert altijd een steekproef van rijen inclusief persoonsgegevens; er is geen functie om alleen de koprij op te halen. Die gegevens zijn **niet** overgenomen in dit rapport of in logs. Alleen kolomkoppen staan hieronder.

| Tabblad | Bereik | Kolomkoppen |
|---|---|---|
| Offertes-bellen | A1:AJ2000 (36 kol.) | ID, Bedrijfsnaam, Contactpersoon, Telefoonnummer, E-mailadres, Website, Straat, Postcode, Plaats, Status, Belreservering, Gebeld, Laatste beldatum, Laatste beltijd, Aantal belpogingen, Gespreks-ID, Gespreksduur, Resultaat, Interesse score, Offerte aangevraagd, Afspraak gemaakt, Terugbelverzoek, Google Calendar Event ID, Niet meer bellen, AI Samenvatting, Transcript, Notities, Foutmelding, Aangemaakt op, Bijgewerkt op, Offertenummer, Offertedatum, Aangeboden dienst, Offerte samenvatting, Totaal incl, Website afspraak URL |
| Gesprekken | A1:T9674 (20 kol.) | Log ID, Bedrijf ID, Bedrijfsnaam, Telefoonnummer, Gesprek ID, Startdatum, Starttijd, Eindtijd, Gespreksduur, Call status, Resultaat, Samenvatting, Transcript, Opmerkingen, Volgende actie, Foutmelding, Contactpersoon, Afspraak gemaakt, Offerte gewenst, Opname-URL |
| Instellingen | A1:C18 | Instelling, Waarde, Beschrijving (o.a. sleutels SpreadsheetID, MaxGesprekkenPerRun, TestModus, TestNummer) |
| Dashboard | A1:B15 | Kengetal, Waarde |
| Offertes | A1:AN2000 (40 kol.) | offertenummer, offertedatum, bedrijfId, bedrijfsnaam, contactpersoon, email, telefoonnummer, telefoonRuw, telGeldig, straat, postcode, plaats, dienst, omschrijving, frequentie, urenPerKeer, uurtarief, bedragExcl, btwPercentage, btwBedrag, totaalIncl, geldigTot, samenvatting, bestandsnaam, opvolgdatum, notitie, nabellen, ontbrekendeVelden, nu, belStatus, belPogingen, laatsteBelpoging, volgendeBelpoging, conversationId, interesseStatus, gespreksSamenvatting, afspraakStatus, afspraakDatum, handmatigeActie, websiteAfspraakUrl |
| Prospects | A1:BV9106 (38 gevulde koppen, AM–BV leeg) | ID, Bedrijfsnaam, Contactpersoon, Telefoonnummer, E-mailadres, Website, Straat, Postcode, Plaats, Status, Belreservering, Gebeld, Laatste beldatum, Laatste beltijd, Aantal belpogingen, Gespreks-ID, Gespreksduur, Resultaat, Interesse score, Offerte aangevraagd, Afspraak gemaakt, Terugbelverzoek, Google Calendar Event ID, Niet meer bellen, AI Samenvatting, Transcript, Notities, Foutmelding, Aangemaakt op, Bijgewerkt op, Bron, Categorie, Bron-URL, Beltoestemming, Toestemming datum, Rechtsvorm, Zakelijk nummer bevestigd, Website afspraak URL |

### Structurele observaties (zonder persoonsgegevens)
- Idempotentiesleutels aanwezig: `ID` (Offertes-bellen/Prospects), `Log ID` (Gesprekken), `offertenummer` + `conversationId` (Offertes). Let op: `offertenummer` lijkt niet uniek per rij (meerdere rijen met hetzelfde nummer) — niet geschikt als unieke sleutel.
- Compliance-velden aanwezig in Prospects: `Niet meer bellen`, `Beltoestemming`, `Toestemming datum`, `Zakelijk nummer bevestigd`. Offertes-bellen mist `Beltoestemming`/`Toestemming datum`.
- Kolommen `Transcript`, `AI Samenvatting`, `Opname-URL` bevatten (potentieel) gespreksinhoud: bijzondere aandacht voor bewaartermijn (AVG).
- Tabblad Gesprekken bevat foutregels van de n8n-belworkflows (Call status "WORKFLOW FOUT": time-outs / service unavailable in node "Lees Instellingen"); suggestie: Retry on Fail (3×, backoff) op die node.
- Datumnotatie inconsistent: ISO (`2026-07-30`) naast `30-7-2026, 02:59:29`.
- Offertes: kolom `telefoonRuw` toont `#ERROR!` in steekproef — formulefout.

## Wat werkte / wat niet
| Onderdeel | Resultaat |
|---|---|
| Shopify `get-shop-info` | Werkt |
| Shopify `graphql_query` orders + voorraad | Werkt; 0 bestellingen, 0 varianten < 3 |
| Google Drive metadata + structuur lezen | Werkt; geen filter op alleen koprij mogelijk (steekproef met PII wordt meegeleverd, niet overgenomen) |
| Mutaties / geplande taken | Niet uitgevoerd (conform opdracht) |
| Activiteitenlog | Niet bijgewerkt: alleen-lezen test, geen goedgekeurde actie uitgevoerd |
