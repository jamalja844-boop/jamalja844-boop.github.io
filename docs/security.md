# Beveiliging & toestemmingen

## Toestemmingsmodel
- `.claude/settings.json` → `permissions.ask`: elke tool die publiceert, verstuurt, betaalt, deelt, verwijdert of advertenties/producten wijzigt vraagt **altijd** om bevestiging (Metricool inplannen, Shopify-mutaties/thema publiceren/kortingen/voorraad, Drive delen/verwijderen/bewerken, GitHub push/PR/merge, Supermetrics campagne- en socialbeheer, kloudboard publiceren/credits kopen, betaalde verrijking, geplande taken, `git push`, `rm -r`, POST-requests via curl).
- `permissions.deny`: lezen van `.env`, sleutels en credential-bestanden.
- Daarnaast eisen alle agentprompts expliciete goedkeuring in het gesprek (dubbele zekerheid).

## Least privilege per agent
| Agent | Mag | Mag niet |
|---|---|---|
| orchestrator | delegeren, lezen, plannen | zelf MCP-schrijfacties |
| social-media-manager | Metricool, Supermetrics, beeldtools, Drive lezen | Shopify, GitHub, e-mail |
| website-designer | Shopify, Figma, GitHub (branch/PR), audits | Metricool, leads |
| competitor-tracker | openbaar zoeken/scrapen, SEO-tools, analytics lezen | publiceren, Drive schrijven |
| lead-finder | openbaar zoeken, Drive lezen/aanmaken | betaalde persoonsverrijking (uitgeschakeld), berichten versturen |
| campaign-manager | concepten, Drive, Shopify lezen | social publiceren, websites |
| content-strategist | onderzoek, keywords, analytics lezen | publiceren, mutaties |
| automation-manager | Shopify lezen, Drive, geplande taken (met akkoord), Metricool review-concepten | direct publiceren |

## Geheimen
- Nooit in repo, `.mcp.json`, CLAUDE.md of chat. `.gitignore` sluit `.env*`, `secrets/`, `*.pem` uit.
- In Claude Code cloud: sleutels via de beveiligde netwerk-credential-opslag van de omgeving (wordt per host geïnjecteerd). Lokaal: omgevingsvariabelen.
- `tests/validate_agents.py` scant op bekende sleutelpatronen.

## Privacy (AVG)
- Alleen zakelijke, openbaar gepubliceerde contactgegevens met bron. Geen persoonsprofielen.
- Suppressielijst: `memory/suppression-list.csv`. Bewaartermijn leads: maximaal 12 maanden zonder contact, daarna verwijderen (na akkoord).
