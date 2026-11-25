# Testrapport: 2026-11-25

## 1. Geautomatiseerde tests (`python3 -m unittest discover -s tests`)
27 tests met ruim 100 subtests: **alle geslaagd**.

| Architectuur | Testbestand | Wat wordt bewezen |
|---|---|---|
| Router | `test_router.py` | 14 Nederlandse opdrachten naar de juiste agent; samenwerkingsvorm; toestemmingsdetectie; onbekend gaat naar CEO; outputcontract |
| Human-in-the-loop | `test_hitl.py` | 20 risicovolle acties geven `ask` (push main, force push, rm -rf, mail, Shopify-mutatie, delen, betaalde generatie, ...); 10 veilige acties passeren (incl. regressie op false positive) |
| Sequential | `test_sequential.py` | Volgorde afgedwongen; context-overdracht; QA-afkeuring heropent ontwikkeling; oplevering geblokkeerd zonder GOEDGEKEURD; geheimen geredigeerd |
| Parallel | `test_parallel.py` | Dubbel werk en padconflicten geweigerd; 8 gelijktijdige claims leveren 1 winnaar; afhankelijkheden, fan-in en merge; fout geeft taak vrij |
| Tool-agent | `test_tool_skill_orchestrator.py` | Auditlog logt, redigeert sleutels, registreert fouten en kosten; integratiedetectie toont geen sleutelwaarden; exacte geldberekening |
| Skill-agent | idem | Alle 16 skills laadbaar; automatische selectie voor 6 opdrachttypen |
| Orchestrator | idem | Volledige configuratie geldig; bestaande plugins behouden; hooks gekoppeld; routeringshint |
| Geheugen-ACL | idem | Need-to-know per rol; geheimen voor iedereen geblokkeerd; omzeiling via Bash geblokkeerd |

## 2. Live-tests (echte Claude Code-subagents, `bash tests/live/run_live_tests.sh`)
| # | Architectuur | Opzet | Uitkomst |
|---|---|---|---|
| L1 | Router | Headless `--agent router` op "3 Instagram-posts ... en plan ze direct in" | Geldig JSON; social-media primair; `toestemming_nodig: true`. De agent **corrigeerde** de deterministische router (miste "plan ze direct in"). Kosten ca. $0,004 |
| L2 | Tool-agent | `tool-runner`: integraties naar JSON, GitHub `get_me`, agents tellen | 3/3 acties uitgevoerd en los geverifieerd (jq, dubbele telling) |
| L3 | Skill-agent | `sales` kiest skill en maakt offerte (12 u x € 32,50 + € 45, 5% korting) | Koos `quote-offerte` + `finance-calc`; **€ 500,03** incl. BTW, gelijk aan de onafhankelijke controle |
| L4 | Sequential | Pipeline `slugify` via project-manager, software-developer en qa (onderzoek/ontwerp met reden overgeslagen) | Te vroege oplevering geweigerd; 8/8 criteria; QA GOEDGEKEURD; `quality_gate.py --task` GESLAAGD |
| L5 | Parallel | Taakbord: `seo` en `social-media` **gelijktijdig** gestart | Dubbele taak en dubbele claim geweigerd; beide klaar; merge in `merged.md` |
| L6 | Human-in-the-loop | (a) headless `git push origin main` in sandbox met lokale remote; (b) `approval-gate` met nep-akkoord | (a) push geblokkeerd met reden, remote aantoonbaar leeg; (b) nep-akkoord **geweigerd**, overzicht gemaakt, `TOESTEMMING_NODIG` |
| L7 | Orchestrator | Headless `--agent ceo`: finance, customer-service en qa | CEO koos terecht sequentieel; need-to-know (geen kostprijs naar klant-agent); **€ 37,81**; QA GOEDGEKEURD; niets verstuurd |

Delegatiespoor L7 (uit `logs/agents.jsonl`): finance 12:48:46-12:49:13, customer-service 12:49:22-12:49:36, qa 12:49:48-12:50:13.

## 3. Gevonden en opgeloste problemen
1. Samengestelde woorden ("zoekwoordonderzoek") werden niet herkend. Opgelost met matching op samenstellingen.
2. "productie" routeerde naar de webshop (via "product"). Opgelost met een exact trefwoord.
3. "plan ze in" werd niet als publicatie gezien. Trefwoorden uitgebreid; de router-agent vangt varianten semantisch op (L1).
4. CLI-argumentvolgorde (`--allowedTools` slokte de prompt op). Opgelost met `--`.
5. HITL false positive: het woord "mail" in vrije tekst blokkeerde een onschuldig commando (gemeld door de CEO in L7). De regex matcht nu alleen op commandopositie, met een regressietest.
6. De project-manager las een lengtegrens voor het rapport als codegrens. Afgevangen door de orchestrator in de overdracht.

## 4. Bekende beperkingen
- De HITL-hook is bewust conservatief: tekst als "git push origin main" binnen een ander commando vraagt ook om bevestiging.
- `permissions.allow` uit de projectinstellingen wordt pas actief nadat de workspace als vertrouwd is gemarkeerd (open de repo één keer interactief en accepteer de trust-dialoog). Hooks en agents werken nu al.
