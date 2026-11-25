# Workflows
Elke `.yaml` volgt het schema uit skill `workflow-design` en wordt gevalideerd door `python3 tests/validate_agents.py`.
| Workflow | Status | Trigger |
|---|---|---|
| lead-generation | actief (handmatig) | "zoek nieuwe zakelijke klanten…" |
| quote-request-intake | wacht-op-koppeling (Gmail/n8n/Calendar) | webhook/e-maillabel |
| social-content-week | actief, schema nog niet aangemaakt | vrijdag |
| competitor-weekly | actief, schema nog niet aangemaakt | maandag |
| shopify-orders | actief, schema nog niet aangemaakt | dagelijks |
| monthly-reporting | actief, schema nog niet aangemaakt | 1e van de maand |
Geplande taken worden pas aangemaakt nadat je het schema hebt goedgekeurd.
