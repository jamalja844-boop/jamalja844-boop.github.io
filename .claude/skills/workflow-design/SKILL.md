---
name: workflow-design
description: 'Ontwerpt en documenteert automatiseringsworkflows met trigger, voorwaarden, acties, goedkeuringspunten, foutafhandeling en logging in workflows/*.yaml, en bepaalt per stap welk echt beschikbaar platform (Claude geplande taken, Shopify, Google Drive, Metricool, n8n) het uitvoert. Gebruik voor elke automatiseringsvraag.'
---
# Workflow design
## Verplicht YAML-schema (gevalideerd door tests/validate_agents.py)
```yaml
id: kebab-case
naam: Leesbare naam
doel: ...
eigenaar: automation-manager
status: actief | ontwerp | wacht-op-koppeling
trigger: {type: schema|webhook|handmatig|event, bron: ..., details: ...}
voorwaarden: [ ... ]
stappen:
  - id: s1
    agent: lead-finder | ... | automation-manager
    actie: ...
    integratie: shopify | google-drive | metricool | ... | geen
    goedkeuring_vereist: true|false
foutafhandeling: {retries: 3, backoff: exponentieel, bij_falen: ...}
logging: {activiteitenlog: memory/logs/activity-log.md, rapport: reports/automation/}
```
## Ontwerpregels
- Elke externe actie (versturen, publiceren, betalen, verwijderen, order-mutatie) → `goedkeuring_vereist: true`.
- Idempotentie: gebruik een unieke sleutel (bijv. order-ID, e-mail-Message-ID) en controleer het log vóór uitvoeren.
- Integratie niet verbonden → `status: wacht-op-koppeling` + benodigde koppeling in `docs/integrations.md`.
- n8n-export: lever ook node-overzicht (Webhook → IF → Set → HTTP/Gmail/Sheets → Error Trigger) zodra n8n gekoppeld is.
