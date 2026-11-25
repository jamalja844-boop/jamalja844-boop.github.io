---
name: quote-offerte
description: "Maakt professionele Nederlandse offertes en prijsvoorstellen met exacte berekening (excl. BTW, BTW 21%/9%, incl. BTW, korting) via workflows/engine/calc.py. Gebruik voor offertes, prijsopgaven, prijsvoorstellen en salesvoorstellen."
allowed-tools: Bash(python3 workflows/engine/calc.py *)
---
# Offerte maken

1. **Gegevens verzamelen:** klant (naam, adres, contactpersoon), werkzaamheden/producten, aantallen/uren, prijzen excl. BTW, BTW-tarief, korting, geldigheid (standaard 30 dagen), start/levering. Ontbrekend -> `[ONTBREEKT]`.
2. **Berekenen (verplicht via script):**
   ```bash
   python3 workflows/engine/calc.py offerte --regel "Kantoorschoonmaak|10|35.00" --regel "Materiaal|1|25" --btw 21 --korting 0
   ```
   Gebruik de getallen uit de JSON-uitvoer letterlijk; plak de uitvoer onder "Bewijs van controle".
3. **Opbouw offerte:**
   ```
   OFFERTE <nummer> - <datum>
   Aan: <klant>
   Betreft: <omschrijving>
   | Omschrijving | Aantal | Prijs excl. | Totaal excl. |
   Subtotaal excl. BTW / Korting / Totaal excl. BTW / BTW 21% / Totaal incl. BTW
   Geldig tot: <datum>  ·  Voorwaarden: <betaaltermijn 14 dagen, ...>
   ```
4. Bedragen weergeven als `€ 1.234,56`.
5. Versturen naar de klant = toestemming vereist (`approval-gate`).
