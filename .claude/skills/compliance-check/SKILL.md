---
name: compliance-check
description: 'Controleert vóór verzending of publicatie of commerciële communicatie en gegevensverwerking voldoen aan AVG, Telecommunicatiewet (art. 11.7), WhatsApp Business-beleid, platformregels en Nederlandse reclameregels. Gebruik vóór elke e-mail, WhatsApp, nieuwsbrief, leadlijst of advertentie.'
---
# Compliance check (geen juridisch advies — bij twijfel jurist raadplegen)
Beantwoord elk punt met ✅ / ⚠️ / ❌ en toon de tabel aan de eigenaar.
1. **Ontvanger**: rechtspersoon (algemeen zakelijk adres) of natuurlijk persoon (incl. eenmanszaak/vof)? Natuurlijk persoon → voorafgaande **opt-in** vereist voor e-mail/WhatsApp/sms (Tw 11.7), tenzij bestaande klant + soortgelijk product + afmeldkans bij verkrijging.
2. **Rechtsgrond AVG**: toestemming / overeenkomst / gerechtvaardigd belang (belangenafweging vastgelegd in `memory/decisions.md`).
3. **Herkomst gegevens**: openbaar gepubliceerd door het bedrijf zelf, bron vastgelegd? Geen gekochte/gescrapete lijsten in strijd met voorwaarden.
4. **Bericht bevat**: identiteit afzender (naam, KvK, adres), duidelijk commercieel doel, werkende afmeldmogelijkheid, geen misleidende onderwerpregel.
5. **WhatsApp Business**: opt-in aanwezig; buiten 24-uursvenster alleen goedgekeurde templates; marketingtemplates gemarkeerd als marketing.
6. **Bel-me-niet**: telefonische acquisitie naar consumenten alleen bij toestemming/klantrelatie; zakelijk: respecteer bezwaar direct.
7. **Reclamecode**: claims onderbouwd, prijzen inclusief btw voor consumenten, acties met voorwaarden en looptijd.
8. **Afmeldingen/bezwaren** verwerkt (suppressielijst `memory/suppression-list.csv`) en ontvangers daarmee gefilterd.
Uitkomst: **GO** (alle ✅), **GO met aanpassing** (⚠️ benoemd), **NO-GO** (❌ aanwezig → niet verzenden).
