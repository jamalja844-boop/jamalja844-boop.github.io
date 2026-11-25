---
name: competitor-report
description: 'Maakt een (wekelijks) concurrentierapport op basis van openbare bronnen met bron en controledatum per bevinding, wijzigingsdetectie t.o.v. vorige snapshot en commerciële kansen. Gebruik voor concurrentieanalyse, prijsvergelijking of marktonderzoek.'
---
# Competitor report
## Snapshot per concurrent → `memory/competitors/<domein>.json`
```json
{"naam":"","domein":"","regio":"","gecontroleerd":"JJJJ-MM-DD",
 "diensten":[{"naam":"","bron":""}],
 "prijzen":[{"dienst":"","prijs":"","eenheid":"","bron":"","datum":""}],
 "acties":[{"omschrijving":"","bron":"","datum":""}],
 "social":[{"platform":"","url":"","posts_30d":null,"bron":""}],
 "reviews":{"platform":"","score":null,"aantal":null,"bron":"","datum":""},
 "seo":{"zoekwoorden_top10":null,"bron":"OpenRush","datum":""}}
```
`null` = niet gevonden. Nooit invullen zonder bron.
## Rapport → `reports/competitors/<datum>-<bedrijf>.md`
1. Samenvatting (5 bullets) 2. Overzichtstabel 3. Wijzigingen sinds vorige week (diff van snapshots) 4. Prijsvergelijking (alleen openbare prijzen) 5. Reviews: thema's positief/negatief 6. SEO-gaten 7. **Kansen** (concreet, met onderbouwing) 8. Bronnenlijst met datums.
## Wekelijks
Automatiseren via workflow `workflows/competitor-weekly.yaml`.
