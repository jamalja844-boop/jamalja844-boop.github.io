# AI Business & Marketing Agents — projectinstructies

Communiceer standaard in **natuurlijk, professioneel Nederlands**. Dit project bevat (1) de statische GitHub Pages-site (`index.html`, `privacy.html`, `terms.html`) en (2) een multi-agentsysteem voor marketing en bedrijfsautomatisering.

## Bedrijven
| Bedrijf | Profiel | Kanalen |
|---|---|---|
| Clean Schoonmaakbedrijf B.V. | `memory/brands/clean-schoonmaakbedrijf.md` | Metricool-brand `8165491` (Facebook, TikTok, YouTube, Google Business Profile, Meta Ads, Google Ads, TikTok Ads) |
| NobleNest.nl | `memory/brands/noblenest.md` | Shopify-winkel `noblenest.nl` |
| Andere bedrijven / nieuwe projecten | maak `memory/brands/<slug>.md` op basis van `memory/brands/_template.md` | — |

Lees altijd eerst het merkprofiel voordat je content, berichten of ontwerpen maakt. Gebruik uitsluitend het officiële logo en de vastgelegde huisstijl. Velden met `TE BEVESTIGEN` mogen niet worden ingevuld met aannames — vraag het na.

## Routering (centrale orchestrator)
De hoofdsessie fungeert als orchestrator (zie `.claude/agents/orchestrator.md` en skill `orchestrate-task`). Start de sessie desgewenst expliciet met `claude --agent orchestrator`.

| Verzoek gaat over… | Specialist |
|---|---|
| posts, reels, stories, publicatiekalender, socialmedia-statistieken | `social-media-manager` |
| websites, landingspagina's, Shopify-thema, WordPress, SEO-techniek, performance | `website-designer` |
| concurrenten, prijzen, marktinformatie, reviews | `competitor-tracker` |
| nieuwe zakelijke klanten / prospects | `lead-finder` |
| e-mail, WhatsApp, offertes beantwoorden/opvolgen, nieuwsbrieven | `campaign-manager` |
| strategie, contentplanning, blogs, scripts, AI-beeld/videoprompts | `content-strategist` |
| workflows, triggers, CRM-updates, Shopify-orders, rapportages, planning | `automation-manager` |

Onafhankelijke deeltaken parallel uitvoeren; afhankelijke deeltaken achter elkaar. Subagents kunnen zelf geen subagents starten — alleen de hoofdsessie (orchestrator) delegeert.

## Harde regels (gelden voor alle agents)
1. **Goedkeuring vereist** vóór: publiceren, versturen (e-mail/WhatsApp/DM), betalingen, advertentiewijzigingen, prijs- of productwijzigingen in Shopify, thema-publicatie, verwijderen van bestanden/data, delen van bestanden. Toon altijd eerst een concept + doel + kanaal + ontvanger(s). Zie `docs/security.md`.
2. **Geen verzonnen gegevens.** Elke feitelijke bewering over markt, prijzen, concurrenten of leads krijgt een bron-URL en controledatum (`JJJJ-MM-DD`). Onbekend = "niet gevonden", nooit schatten zonder label.
3. **Geen gesimuleerde integraties.** Werkt een koppeling niet, meld dat en verwijs naar `docs/integrations.md`.
4. **AVG / Telecommunicatiewet:** geen ongevraagde commerciële e-mail/WhatsApp naar natuurlijke personen zonder opt-in; zakelijke e-mail alleen naar algemene zakelijke adressen, met afmeldmogelijkheid en identiteit afzender. Gebruik skill `compliance-check`.
5. **Geheimen** nooit in bestanden, commits of chat. Sleutels via omgevingsvariabelen of de beveiligde credential-opslag.
6. Registreer elke uitgevoerde (goedgekeurde) actie in `memory/logs/activity-log.md`.

## Mappen
- `.claude/agents/` — 8 agents · `.claude/skills/` — herbruikbare skills
- `workflows/` — workflowdefinities (trigger → voorwaarden → acties → foutafhandeling → logging)
- `reports/` — gegenereerde rapporten (`reports/<type>/<JJJJ-MM-DD>-<bedrijf>.md`)
- `memory/` — merkprofielen, CRM-verwijzingen, beslissingen, activiteitenlog
- `tests/` — validatie (`python3 tests/validate_agents.py`) en testscenario's
- `docs/` — integratiestatus, beveiliging, gebruikshandleiding

## Testen
Na wijzigingen aan agents/skills/workflows: `python3 tests/validate_agents.py` moet slagen.
