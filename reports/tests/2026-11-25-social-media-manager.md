# Testrapport social-media-manager — Clean Schoonmaakbedrijf B.V.
- Datum: 2026-11-25 · Type: TEST-OPDRACHT (niets gepubliceerd of ingepland, geen create/update-calls)
- Merkprofiel: `memory/brands/clean-schoonmaakbedrijf.md`

## 1. Metricool-calls
| Call | Parameters | Resultaat |
|---|---|---|
| `getBestTimeToPostByNetwork` | brandId `8165491`, facebook, Europe/Amsterdam, 2026-11-30T00:00+01:00 t/m 2026-12-06T23:59+01:00 | **Werkte** — 7 dagen × 24 uur data ontvangen |
| `createScheduledPost(ForReview)` / `updateScheduledPost` | — | Bewust niet aangeroepen (testopdracht) |

### Echte best-time-data Facebook (bron: Metricool, opgehaald 2026-11-25)
Waarde = relatieve Metricool-score (hoger = beter; eenheid niet gespecificeerd door Metricool). Aanname: `dayOfWeek` 1 = maandag … 7 = zondag (ISO); datums hieronder op basis daarvan.

| Dag (datum) | Beste uur | Score | 2e beste uur | Score |
|---|---|---|---|---|
| ma 1 (30-11) | 10:00 | 15.247 | 12:00 | 14.786 |
| di 2 (01-12) | 10:00 | 14.999 | 12:00 | 14.646 |
| wo 3 (02-12) | **12:00** | **15.834** (hoogste van de week) | 10:00 | 15.528 |
| do 4 (03-12) | 10:00 | 12.351 | 12:00 | 11.965 |
| vr 5 (04-12) | 10:00 | 12.767 | 12:00 | 12.237 |
| za 6 (05-12) | 10:00 | 8.850 | 11:00 | 7.880 |
| zo 7 (06-12) | 10:00 | 7.653 | 12:00 | 6.913 |

Conclusie: doordeweeks 10:00–12:00 is het sterkst; weekend duidelijk zwakker. Advies-slot: woensdag 2 december 2026, 12:00.
TikTok-best-time is niet opgevraagd (buiten opdracht); TikTok-tijd hieronder is een voorstel, geen data.

## 2. Facebook-post (concept)
```
Bedrijf: Clean Schoonmaakbedrijf B.V. / Facebook / feedpost 1080×1350 (4:5) / doel: offerte-aanvragen / publicatiemoment: wo 2026-12-02 12:00 (Europe/Amsterdam, op basis van Metricool-data)
Hook (eerste regel): Natte schoenen, grijze vloeren? Zo blijft uw kantoor deze winter fris.
Onderschrift:
Natte schoenen, grijze vloeren? Zo blijft uw kantoor deze winter fris.

In de winter komen zand, strooizout en vocht dagelijks mee naar binnen. Dat zie je terug op vloeren, entreematten en in de pantry. Wij stemmen de schoonmaak van uw kantoor af op het seizoen:
- extra aandacht voor entree, vloeren en matten
- hygiënische reiniging van deurklinken, bureaus en gedeelde ruimtes
- een frisse werkplek waar uw team en bezoekers zich welkom voelen
CTA: Vraag vrijblijvend een offerte op maat aan — stuur ons een bericht. 📋
Hashtags: #kantoorschoonmaak #zakelijkeschoonmaak #schoonmaakbedrijf #winter #schoonkantoor #facilitymanagement
Alt-tekst: Lichte, schone kantoorentree in de winter met droge entreemat en glanzende vloer; buiten is sneeuw zichtbaar door de glazen deur.
Beeldprompt: zie §4 (beeld A)
Bronnen (bij cijfers): geen cijfers gebruikt
```

## 3. TikTok-concept
```
Bedrijf: Clean Schoonmaakbedrijf B.V. / TikTok / video 1080×1920 (9:16), ca. 20 s / doel: bekendheid + offerte / publicatiemoment: voorstel do 2026-12-03 17:00 (niet op data gebaseerd — TikTok-best-time eerst ophalen)
Hook (in beeld, 0–2 s): "Dit sleept uw team deze winter elke dag mee naar binnen..."
Onderschrift: Strooizout, modder en natte voetstappen: wintervloeren hebben extra zorg nodig. Wij houden uw kantoor fris, het hele seizoen. Vrijblijvend offerte? Stuur een bericht!
CTA: "Vraag vrijblijvend een offerte aan — link/bericht"
Hashtags: #kantoorschoonmaak #schoonmaak #winter #cleantok #zakelijk
Alt-tekst / ondertitels: volledig ondertiteld (geluid uit-vriendelijk)
Videoprompt (per scène):
Scène 1 (0–3 s): close-up, statische camera, natte schoenafdrukken en strooizout op lichtgrijze kantoorvloer bij entree, koel daglicht, harde cut · Ondertitel: "Dit komt elke dag mee naar binnen…"
Scène 2 (3–8 s): medium shot, langzame dolly, schoonmaker (gezicht niet herkenbaar, handen/rug in beeld) reinigt vloer met professionele machine/mop, overgang whip-pan · Ondertitel: "Extra aandacht voor entree en vloeren"
Scène 3 (8–13 s): close-up's, handheld, desinfecteren van deurklink en bureaublad, zacht licht · Ondertitel: "Hygiënisch in het griepseizoen"
Scène 4 (13–18 s): wide shot, langzame push-in, licht, opgeruimd kantoor met droge entreemat, sneeuw buiten zichtbaar door raam · Ondertitel: "Fris kantoor, de hele winter"
Scène 5 (18–20 s): eindkaart, lege ruimte midden voor [officieel logo plaatsen, niet genereren] + tekst "Vraag vrijblijvend een offerte aan"
Voice-over: rustig, vriendelijk, Nederlands, u-vorm · Muziek: lichte, opgewekte instrumentale track (rechtenvrij / TikTok-bibliotheek) · Ratio 9:16 · Duur ca. 20 s
Negatief: tekst in AI-beeld, watermerken, vervormde handen, nep-logo's, herkenbare echte personen
Label: bij AI-gegenereerd beeld TikTok-label "AI-generated" aanzetten
```

## 4. Beeldprompt (beeld A, Facebook)
"Lichte, schone kantoorentree in de winter na professionele schoonmaak, droge grijze entreemat en glanzende vloer, buiten door glazen deur zachte sneeuw, koel ochtendlicht met warme binnenverlichting, ooghoogte, 35mm, frisse en betrouwbare uitstraling, kleurpalet: [HUISSTIJLKLEUREN — TE BEVESTIGEN, tot dan neutraal wit/lichtgrijs/frisblauw accent], fotorealistisch editorial, 4:5, lege ruimte rechtsonder voor officieel logo, negatief: tekst, watermerken, vervormde handen, nep-logo's, personen"

## 5. Open punten / blokkades
- Huisstijlkleuren, lettertypen en hoge-resolutie logobestand staan in het merkprofiel op **TE BEVESTIGEN** — niet ingevuld met aannames. Logo-referentie voorlopig: Metricool-brandafbeelding (Facebook-profielfoto).
- Geen beeld gegenereerd (kost credits; niet gevraagd). Bij generatie eerst model + kosten noemen (bijv. `openart_model_cost`).
- Instagram, LinkedIn en X niet gekoppeld in Metricool.
- Niet gelogd in `memory/logs/activity-log.md`: er is niets gepubliceerd of ingepland.
