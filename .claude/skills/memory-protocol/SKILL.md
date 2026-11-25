---
name: memory-protocol
description: "Regels voor projectgeheugen, bedrijfskennis, taakgeschiedenis, agentcommunicatie, foutregistratie en kennisdeling in memory/, inclusief need-to-know toegangsrechten. Gebruik wanneer een agent informatie moet opslaan, opzoeken of overdragen aan een andere agent."
---
# Geheugenprotocol

| Map | Inhoud | Wie schrijft |
|---|---|---|
| `memory/company/` | Bedrijfskennis: merken, tone of voice, prijzen, beleid | ceo, project-manager |
| `memory/projects/<project>/` | `plan.md`, `status.md`, besluiten, opleveringen | betrokken agents |
| `memory/tasks/<ID>/` | Pipeline-/taakbordstatus en fase-outputs (taakgeschiedenis) | via `pipeline.py`/`taskboard.py` |
| `memory/messages/` | Agentcommunicatie: `<JJJJMMDD>-<van>-naar-<aan>.md` | iedereen |
| `memory/knowledge/` | `lessons.md` (lessen), `errors.jsonl` (fouten), research-notities | iedereen |
| `memory/approvals/` | Goedkeuringsverzoeken | approval-gate, ceo |
| `memory/hr/` | Personeelsgegevens - **alleen hr + ceo** | hr |
| `memory/finance/` | Financiële data - finance (sales/ceo lezen) | finance |
| `memory/customers/` | Klantgegevens - customer-service, sales, e-commerce | idem |

Toegang wordt technisch afgedwongen door `.claude/hooks/memory_acl.py` op basis van `memory/acl.json`.

## Regels
- **Eerst zoeken, dan werken:** `grep -ril "<onderwerp>" memory/knowledge memory/projects` om dubbel werk te voorkomen.
- **Kort en feitelijk:** datum (JJJJ-MM-DD), bron, wie. Geen ruwe dumps.
- **Nooit** geheimen, wachtwoorden of volledige persoonsgegevens buiten de daarvoor bestemde map.
- **Les geleerd?** Eén regel in `memory/knowledge/lessons.md`: `- 2026-11-25 [agent] les`.
- **Overdracht:** wat de volgende agent moet weten hoort in de sectie "Overdracht" van je output; voor langere overdrachten een bericht in `memory/messages/`.
- Privacy: vertrouwelijke mappen staan in `.gitignore` en worden niet naar de (openbare) repository gepusht.
