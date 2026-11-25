# Acquisitieconcepten – Clean Schoonmaakbedrijf B.V. – Utrecht (test) – 2026-11-25

Status: **CONCEPT – NIETS VERZONDEN.** Samenwerkingstest, stap 4 van `workflows/lead-generation.yaml`.
Gmail/Outlook/WhatsApp Business zijn niet verbonden (zie `docs/integrations.md`).

Input:
- Leads: `reports/leads/2026-11-25-clean-utrecht-test.csv` (lead-finder, gecontroleerd 2026-11-25)
- Marktinformatie: `reports/tests/2026-11-25-competitor-tracker.md` (competitor-tracker, 2026-11-25)
- Merkprofiel: `memory/brands/clean-schoonmaakbedrijf.md`
- Suppressielijst: `memory/suppression-list.csv` (leeg op 2026-11-25; geen van de leads staat erop)

## 1. Compliance-check (skill `compliance-check`, geen juridisch advies)

| # | Controlepunt | Tandarts Utrecht Centrum | VvE WoonVisie | ALL INN Fitness & Health |
|---|---|---|---|---|
| 1 | Ontvanger rechtspersoon, algemeen zakelijk adres | ⚠️ `info@` is algemeen adres; rechtsvorm onbekend (praktijk kan eenmanszaak/maatschap zijn = opt-in nodig) | ⚠️ `info@` algemeen adres; rechtsvorm onbekend | ⚠️ `info@` algemeen adres; rechtsvorm onbekend |
| 2 | Rechtsgrond AVG (gerechtvaardigd belang, afweging vastgelegd) | ⚠️ belangenafweging nog niet in `memory/decisions.md` | ⚠️ idem | ⚠️ idem |
| 3 | Herkomst gegevens openbaar, bron vastgelegd | ✅ eigen contactpagina, bron + datum | ⚠️ alleen gezien in zoekexcerpt, niet apart gescrapet | ✅ eigen infopagina, bron + datum |
| 4 | Bericht: afzender (naam, KvK, adres), commercieel doel, afmelding, eerlijke onderwerpregel | ⚠️ KvK/adres/telefoon Clean TE BEVESTIGEN (placeholders) | ⚠️ idem | ⚠️ idem |
| 5 | WhatsApp Business | n.v.t. (alleen e-mail) | n.v.t. | n.v.t. |
| 6 | Bel-me-niet / telefonisch | n.v.t. (geen belactie) | n.v.t. | n.v.t. |
| 7 | Reclamecode: claims onderbouwd, geen prijzen zonder bron | ✅ geen prijzen of ongestaafde claims in tekst | ✅ idem | ✅ idem |
| 8 | Suppressielijst toegepast | ✅ niet op lijst | ✅ niet op lijst | ✅ niet op lijst |
| | **Uitkomst** | **GO met aanpassing** | **GO met aanpassing** | **GO met aanpassing** |

Geen enkele lead is op dit moment volledig GO; geen NO-GO. Concepten zijn geschreven maar zijn **pas verzendklaar** na:
- A. Rechtsvorm per lead controleren in het KvK-handelsregister (B.V./N.V./stichting/vereniging = mag; eenmanszaak/vof/maatschap = **NO-GO** zonder opt-in).
- B. Belangenafweging gerechtvaardigd belang vastleggen in `memory/decisions.md`.
- C. Bedrijfsgegevens Clean invullen (KvK, adres, telefoon, naam/functie afzender, e-mail, website) – nu TE BEVESTIGEN in merkprofiel.
- D. Afmeldproces inrichten: antwoord "afmelden" wordt binnen [X] werkdagen verwerkt in `memory/suppression-list.csv`.
- E. Alleen VvE WoonVisie: e-mailadres zelf verifiëren op https://www.vvewoonvisie.nl/.

## 2. E-mailconcepten (skill `campaign-drafting`, B2B-acquisitie, u-vorm)

Gebruikte kansen uit het concurrentierapport (zonder concurrenten te noemen): persoonlijk alternatief voor MKB/praktijken (kans 4), duidelijke afspraken en een heldere offerte (kans 1, zonder prijs want eigen tarieven onbekend), haalbare reactietijd (kans 3, alleen als placeholder tot eigenaar bevestigt).
Verwijderen vóór verzending: alle `[...]`-placeholders invullen of de zin schrappen.

### 2.1 Tandarts Utrecht Centrum
- Kanaal: e-mail · Ontvanger: info@tandartsutrechtcentrum.nl (bron: https://tandartsutrechtcentrum.nl/contact/, 2026-11-25)
- Compliance: GO met aanpassing (A–D) · Status: concept, wacht op akkoord

**Onderwerp:** Praktijkschoonmaak buiten uw openingstijden – Clean Schoonmaakbedrijf

Geachte heer/mevrouw,

Een tandartspraktijk vraagt om een hygiënische schoonmaak die de patiëntenzorg niet verstoort. Omdat uw praktijk op het Moskeeplein van maandag tot en met donderdag en op zaterdag open is, kunnen wij de schoonmaak volledig buiten uw openingstijden plannen.

Clean Schoonmaakbedrijf maakt een offerte op maat: we bekijken samen welke ruimtes, welke frequentie en welke tijden bij uw praktijk passen, zodat u vooraf precies weet waar u aan toe bent. [OPTIONEEL – alleen na bevestiging eigenaar: U ontvangt binnen [RESPONSTIJD] een reactie.]

Zal ik eens langskomen voor een vrijblijvende offerte?

Met vriendelijke groet,
[NAAM AFZENDER] · [FUNCTIE]
Clean Schoonmaakbedrijf B.V. · [ADRES] · KvK [KVK-NUMMER]
[TELEFOON] · [E-MAIL] · [WEBSITE]

U ontvangt dit bericht omdat uw praktijk een algemeen zakelijk e-mailadres publiceert. Geen berichten meer ontvangen? Antwoord met "afmelden", dan verwijderen wij uw adres direct.

### 2.2 VvE WoonVisie
- Kanaal: e-mail · Ontvanger: info@vvewoonvisie.nl (bron: https://www.vvewoonvisie.nl/, 2026-11-25 – zoekexcerpt, eerst verifiëren)
- Compliance: GO met aanpassing (A–E) · Status: concept, wacht op akkoord

**Onderwerp:** Schoonmaak trappenhuizen en algemene ruimtes voor uw VvE's

Geachte heer/mevrouw,

Als beheerder van appartementsgebouwen in de regio Utrecht zoekt u voor elke VvE een schoonmaak die netjes, voorspelbaar en goed te verantwoorden is richting bewoners.

Clean Schoonmaakbedrijf denkt graag met u mee over de schoonmaak van trappenhuizen, entrees en andere algemene ruimtes. Per gebouw maken wij een offerte op maat met duidelijke afspraken over taken en frequentie, zodat u die eenvoudig kunt voorleggen aan het VvE-bestuur.

Zal ik eens langskomen voor een vrijblijvende offerte, bijvoorbeeld voor één van uw gebouwen?

Met vriendelijke groet,
[NAAM AFZENDER] · [FUNCTIE]
Clean Schoonmaakbedrijf B.V. · [ADRES] · KvK [KVK-NUMMER]
[TELEFOON] · [E-MAIL] · [WEBSITE]

U ontvangt dit bericht omdat uw organisatie een algemeen zakelijk e-mailadres publiceert. Geen berichten meer ontvangen? Antwoord met "afmelden", dan verwijderen wij uw adres direct.

### 2.3 ALL INN Fitness & Health
- Kanaal: e-mail · Ontvanger: info@allinnfitness.nl (bron: https://www.allinnfitness.nl/info/, 2026-11-25)
- Compliance: GO met aanpassing (A–D) · Status: concept, wacht op akkoord

**Onderwerp:** Schone kleedruimtes bij openingstijden van 06:00 tot 23:00

Geachte heer/mevrouw,

Met een sportschool die elke dag van 06:00 tot 23:00 open is, worden kleedruimtes, douches en de zaal intensief gebruikt. Leden merken direct hoe schoon het is.

Clean Schoonmaakbedrijf stemt de schoonmaak af op uw drukke uren: we kijken samen welke ruimtes vaker aandacht nodig hebben en op welke momenten dat het minst stoort. U ontvangt een offerte op maat met duidelijke afspraken over taken en frequentie.

Zal ik eens langskomen aan de Vlampijpstraat voor een vrijblijvende offerte?

Met vriendelijke groet,
[NAAM AFZENDER] · [FUNCTIE]
Clean Schoonmaakbedrijf B.V. · [ADRES] · KvK [KVK-NUMMER]
[TELEFOON] · [E-MAIL] · [WEBSITE]

U ontvangt dit bericht omdat uw bedrijf een algemeen zakelijk e-mailadres publiceert. Geen berichten meer ontvangen? Antwoord met "afmelden", dan verwijderen wij uw adres direct.

### Opvolging (na akkoord en eerste verzending)
D+3 vriendelijk checken · D+7 meerwaarde (bijv. voorbeeld-takenlijst per ruimte) · D+14 laatste bericht, deur open. Stoppen bij reactie of afmelding. Reacties categoriseren (interesse / vraag / bezwaar / niet nu / afmelden) en loggen in `memory/logs/contact-log.md`.

## 3. Goedkeuringsoverzicht (skill `orchestrate-task`)

| # | Actie | Kanaal | Ontvanger/doel | Inhoud (pad) | Risico | Akkoord? |
|---|---|---|---|---|---|---|
| 1 | Acquisitiemail versturen | E-mail (niet verbonden) | info@tandartsutrechtcentrum.nl – vrijblijvende offerte/bezichtiging | `reports/campaigns/2026-11-25-clean-utrecht-test.md` §2.1 | Middel: rechtsvorm onbekend (mogelijk opt-in nodig); afzendergegevens ontbreken | ☐ Nog niet – eerst A–D |
| 2 | Acquisitiemail versturen | E-mail (niet verbonden) | info@vvewoonvisie.nl – samenwerking schoonmaak algemene ruimtes | idem §2.2 | Middel-hoog: adres niet zelf geverifieerd; rechtsvorm onbekend; afzendergegevens ontbreken | ☐ Nog niet – eerst A–E |
| 3 | Acquisitiemail versturen | E-mail (niet verbonden) | info@allinnfitness.nl – vrijblijvende offerte/bezichtiging | idem §2.3 | Middel: rechtsvorm onbekend; afzendergegevens ontbreken | ☐ Nog niet – eerst A–D |
| 4 | Belangenafweging vastleggen | Intern | `memory/decisions.md` | n.t.b. door eigenaar | Laag | ☐ |
| 5 | Bedrijfsgegevens Clean bevestigen | Intern | `memory/brands/clean-schoonmaakbedrijf.md` (KvK, adres, telefoon, website, afzender) | – | Laag | ☐ |

Open vragen aan eigenaar: KvK-nummer, adres, telefoon (Instagram-fragment noemt 030-2378037 – niet geverifieerd), website, naam/functie afzender, werkgebied, haalbare reactietijd, afmeldproces.
