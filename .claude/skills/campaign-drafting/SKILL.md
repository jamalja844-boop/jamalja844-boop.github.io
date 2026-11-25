---
name: campaign-drafting
description: 'Schrijft e-mails, WhatsApp-berichten, offerte-antwoorden, opvolgreeksen en nieuwsbrieven in natuurlijk Nederlands met personalisatievelden, en analyseert reacties en resultaten. Gebruik voor elke klant- of campagnecommunicatie.'
---
# Campaign drafting
## Sjablonen
**Offerte-antwoord (≤ 150 woorden)**: onderwerp "Uw offerteaanvraag voor {dienst} – {bedrijf_afzender}" → bedankt → samenvatting {behoefte} → 2–3 ontbrekende vragen → voorstel {bezichtiging_datum} → ondertekening met naam, functie, telefoon, KvK.
**Opvolging**: D+3 (vriendelijk checken), D+7 (meerwaarde/case), D+14 (laatste, deur open). Stop bij reactie of afmelding.
**B2B-acquisitie (alleen na compliance GO)**: persoonlijk relevante opening op basis van `mogelijke_behoefte` → 1 concreet voordeel → zachte CTA ("Zal ik eens langskomen voor een vrijblijvende offerte?") → afmeldzin.
**WhatsApp**: ≤ 3 korte alinea's, 1 vraag, geen bijlagen bij eerste bericht; template-variabelen `{{1}}`.
**Nieuwsbrief**: onderwerp ≤ 45 tekens + preheader, 1 hoofdboodschap, 1 primaire CTA, footer met afmelden + bedrijfsgegevens.
## Personalisatie
Velden alleen vullen uit geverifieerde data (leadlijst/CRM). Onbekend veld → generieke formulering, nooit raden (geen "Beste Jan" zonder bron).
## Analyse
Categoriseer reacties: interesse / vraag / bezwaar / niet nu / afmelden. KPI's: open rate, reply rate, positieve replies, afspraken, offertes, conversie. Log in `memory/logs/contact-log.md`; afmelders → `memory/suppression-list.csv`.
## Output
`reports/campaigns/<datum>-<bedrijf>-<campagne>.md` met per variant: kanaal, doelgroep, onderwerp, tekst, compliance-uitkomst, status.
