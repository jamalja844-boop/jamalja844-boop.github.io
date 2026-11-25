---
name: orchestrate-task
description: 'Plant en coördineert een meerstaps bedrijfsopdracht over de zeven specialistische agents (parallel of sequentieel), bundelt resultaten ter goedkeuring en registreert voortgang. Gebruik wanneer een verzoek meer dan één specialisme raakt of onduidelijk is welke agent nodig is.'
---
# Orchestrate task
## 1. Classificeer
| Signaalwoorden | Agent |
|---|---|
| post, reel, story, kalender, volgers, engagement, Metricool | social-media-manager |
| website, landingspagina, Shopify-thema, WordPress, SEO-techniek, snelheid, bug | website-designer |
| concurrent, prijsvergelijking, markt, reviews van anderen | competitor-tracker |
| leads, prospects, nieuwe klanten, bedrijvenlijst | lead-finder |
| e-mail, WhatsApp, offerte beantwoorden/opvolgen, nieuwsbrief | campaign-manager |
| strategie, contentplan, blog, script, prompt, productbeschrijving | content-strategist |
| automatiseer, workflow, CRM, bestelling, rapportage, herinnering, planning | automation-manager |
## 2. Plan (afhankelijkheidsgraaf)
Schrijf: `deeltaak → agent → input → output-pad → hangt af van`. Taken zonder onderlinge afhankelijkheid **in één bericht parallel** starten.
## 3. Delegatie-prompt (template)
"Bedrijf: {x} (profiel: memory/brands/{slug}.md). Doel: {...}. Input: {bestanden}. Lever op: {pad}. Regels: bron+datum bij feiten, niets extern versturen/publiceren, meld ontbrekende toegang."
## 4. Kwaliteitscontrole
Bronnen aanwezig · geen verzonnen data · compliance-check GO · huisstijl toegepast · bestanden op juiste pad.
## 5. Goedkeuringsoverzicht
| # | Actie | Kanaal | Ontvanger/doel | Inhoud (pad) | Risico | Akkoord? |
## 6. Na akkoord uitvoeren → 7. Loggen in `memory/logs/activity-log.md` + samenvatting in `reports/orchestrator/<datum>-<onderwerp>.md`.
