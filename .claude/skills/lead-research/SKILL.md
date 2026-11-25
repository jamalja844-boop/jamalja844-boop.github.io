---
name: lead-research
description: 'Zoekt, verifieert, ontdubbelt en exporteert B2B-leads (bedrijfsnaam, website, plaats, zakelijk e-mail/telefoon, branche, bron, behoefte) binnen AVG en gebruiksvoorwaarden. Gebruik voor "zoek nieuwe zakelijke klanten/prospects/leads".'
---
# Lead research
## Kolommen (vast, CSV UTF-8, scheidingsteken `;` voor Excel-NL)
`bedrijfsnaam;website;vestigingsplaats;branche;zakelijk_email;zakelijk_telefoon;bron_url;controledatum;mogelijke_behoefte;prioriteit;opmerkingen`
## Zoekstrategie per branche (voorbeelden)
- Kantoren / bedrijfsverzamelgebouwen: "bedrijvenpark <plaats>", "kantoorverhuur <plaats>"
- Vastgoed-/VvE-beheer: "VvE beheer <plaats>", "vastgoedbeheer <plaats>"
- Hotels/restaurants: "hotel <plaats>", lokale horeca-overzichten
- Scholen/kinderopvang: openbare overzichten (DUO open onderwijsdata, LRK-register kinderopvang)
- Tandarts/sportschool/industrie/facility: "<branche> <plaats>" + eigen contactpagina
## Verificatie
- Elk e-mailadres/telefoonnummer moet op de bron-URL zichtbaar zijn (contact/colofon). Noteer exact die URL.
- Alleen algemene adressen (info@, contact@, receptie@, administratie@). Persoonsgebonden adressen → weglaten.
- `mogelijke_behoefte`: onderbouwd (bijv. "groot kantoorpand 3 verdiepingen, geen schoonmaakpartner vermeld"), geen gissingen over personen.
- Prioriteit A/B/C op basis van omvang, nabijheid, branche-fit.
## Tools
- `python3 tests/tools/leads_tool.py validate <csv>` — controleert verplichte velden, e-mail/telefoon-formaat, persoonlijke adressen, bron/datum.
- `python3 tests/tools/leads_tool.py dedupe <csv> -o <uit.csv>` — ontdubbelt op genormaliseerd domein/naam+plaats.
- Excel: zet CSV om met skill `xlsx` indien gevraagd. Google Sheet/CRM: alleen na akkoord.
