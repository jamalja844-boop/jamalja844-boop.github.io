# Testrapport agentsysteem — 2026-11-25

## Statische tests
- `python3 tests/validate_agents.py` → GESLAAGD (8 agents, 25 skills, 6 workflows, settings, geen geheimen)
- `python3 -m unittest tests/test_leads_tool.py` → 4/4 OK
- Gevonden en opgelost: (1) dubbele punt in `description` brak de YAML-frontmatter van agents/skills → alle beschrijvingen gequote; (2) competitor-tracker en content-strategist misten goedkeuringsregel → toegevoegd; (3) fout-positief in test op "unfulfilled" → regex verbeterd.

## Functionele tests per agent (native geladen agents, echte calls, niets verstuurd/gepubliceerd)
| Agent | Resultaat | Bewijs |
|---|---|---|
| lead-finder | ✅ 3 leads Utrecht, validatie 0 meldingen; botcontrole niet omzeild; 2 leads als B gemarkeerd (contactgegevens nog handmatig te verifiëren) | `reports/leads/2026-11-25-clean-utrecht-test.csv` |
| competitor-tracker | ✅ 2 concurrenten met bron+datum, 1 openbare vanaf-prijs, overige "prijs niet openbaar" | `reports/tests/2026-11-25-competitor-tracker.md`, `memory/competitors/*.json` |
| social-media-manager | ✅ Metricool best-time Facebook (wo 12:00 hoogste score), FB-post + TikTok-concept; niets ingepland | `reports/tests/2026-11-25-social-media-manager.md` |
| website-designer | ✅ audit + mobiele screenshot, Shopify get-shop-info OK | `reports/tests/2026-11-25-website-designer.md`, `index-mobile.png` |
| content-strategist | ✅ Sinterklaasplanning NobleNest met 8 echte Shopify-producten en OpenRush-zoekvolumes | `reports/tests/2026-11-25-content-strategist.md` |
| automation-manager | ✅ Shopify orders/voorraad gelezen (0 orders 7 d, 140 producten, laagste voorraad 20); CRM-structuur gelezen; n8n-fouten in CRM gesignaleerd | `reports/tests/2026-11-25-automation-manager.md` |
| campaign-manager | ✅ (samenwerkingstest) | `reports/campaigns/2026-11-25-clean-utrecht-test.md` |
| orchestrator | ✅ scenario "nieuwe klanten" uitgevoerd vanuit hoofdsessie: lead-finder ∥ competitor-tracker → campaign-manager → goedkeuringsoverzicht | dit rapport |

## Samenwerkingstest (workflow lead-generation, stap 1–5)
lead-finder + competitor-tracker parallel → campaign-manager gebruikte beide outputs → compliance-check gaf "GO met aanpassing" voor alle 3 leads (rechtsvorm onbekend, belangenafweging en KvK/adres Clean ontbreken) → concepten gemarkeerd als niet verzendklaar → goedkeuringsoverzicht klaar. Stap 6 (verzenden) bewust niet uitgevoerd: geen akkoord en Gmail/Outlook niet verbonden.

## Beperkingen
- Een eerste testronde stopte door de 5-uurslimiet van het account; opnieuw gedraaid na reset.
- Lighthouse/Core Web Vitals niet gemeten in deze test.
