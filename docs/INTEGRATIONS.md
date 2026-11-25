# Integraties

Gedetecteerd op 2026-11-25 met `ListConnectors` en alleen-lezen smoke tests. Machine-leesbaar: `workflows/integrations.json`. Opnieuw controleren: skill `integration-check`.

## Werkend (getest)
| Integratie | Test | Agents |
|---|---|---|
| GitHub (connector) | `get_me`: ok (ook live door tool-runner) | tool-runner, security, software-developer |
| Shopify: winkel NobleNest | `get-shop-info`: Basic, EUR, NL | e-commerce |
| Metricool: merk "Clean schoonmaakbedrijf" | `getBrandSettings`: 1 merk | social-media, marketing |
| Google Drive | `list_recent_files`: ok | research, sales, finance (alleen-lezen) |
| Figma | `whoami`: starter-team | ui-ux |
| Playwright + headless Chromium (lokaal) | `require('playwright')`: ok | browser, frontend, qa |

## Verbonden, niet getest (betaalde units/credits)
Semrush, OpenRush, Supermetrics, Firecrawl, HyperFrames (HeyGen), ElevenLabs. Agents hebben hiervoor alleen alleen-lezen of goedkope tools. Generaties staan achter de HITL-hook.

## Niet beschikbaar / actie nodig
| Integratie | Status | Wat te doen |
|---|---|---|
| Gmail, Outlook, Google Calendar | niet verbonden | claude.ai > Instellingen > Connectors, daarna toolrechten toevoegen aan customer-service, sales of project-manager |
| Supabase | geïnstalleerd, **needs_reconnect** | Opnieuw verbinden in claude.ai Connectors |
| WordPress, Canva | geen connector | Connector toevoegen, of MCP-server in `.mcp.json` met `${VAR}` |
| OpenAI | geen sleutel | Als omgevingsvariabele `OPENAI_API_KEY` instellen via de omgevingsinstellingen, nooit in de repo |
| Google Chrome (Claude in Chrome) | niet in cloudsessie | Lokaal Claude Code met `--chrome`; in de cloud headless Chromium gebruiken |
| Plugin-MCP's `github`, `context7` | proxy weigert verbinding (403) | De GitHub-connector werkt wel. Voor context7: host toestaan in de netwerkinstellingen van de omgeving |

## Regels
- Geen fictieve verbindingen: een integratie staat pas op "werkt" na een geslaagde test.
- API-sleutels nooit in bestanden. Gebruik connectors (OAuth, buiten de repo), omgevingsvariabelen of de credential-manager. `.mcp.json` gebruikt alleen `${VAR}`; `validate.py` weigert letterlijke waarden.
