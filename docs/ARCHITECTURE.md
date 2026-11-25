# Architectuur van het AI multi-agentsysteem

Gebouwd op functies die Claude Code 2.1.332 ondersteunt (geverifieerd tegen code.claude.com/docs): subagents (`.claude/agents/*.md`), skills (`.claude/skills/*/SKILL.md`), hooks en permissies (`.claude/settings.json`), project-MCP (`.mcp.json`) en `CLAUDE.md`.

```
                      gebruiker
                          |
              UserPromptSubmit-hook route_hint.py  --> [router]-hint (gratis)
                          |
                 ORCHESTRATOR (hoofdsessie / ceo)
          +---------------+---------------------+
     router-agent    approval-gate         quality-gate (qa/security)
          |                (HITL)                 ^
   +------+-------------------+                   |
   | sequentieel              | parallel          |
 pipeline.py              taskboard.py ----------+
 analyse->...->oplevering  fan-out -> merge
   |                          |
 specialisten (20) + tool-runner + skill-curator
          |
 PreToolUse-hooks: hitl_guard.py (ask) · memory_acl.py (deny)
 PostToolUse/Subagent-hooks: audit_log.py -> logs/*.jsonl
          |
 memory/ (projecten, kennis, taakgeschiedenis, berichten, approvals, vertrouwelijk)
```

## De zeven architecturen
| Architectuur | Implementatie | Afdwinging |
|---|---|---|
| Tool-agent | `tool-runner` + toolrechten per agent; verplichte stap plan -> uitvoeren -> verifiëren -> registreren | `audit_log.py` logt elke actie, fout en gemeterde aanroep |
| Skill-agent | 16 nieuwe skills + `skill-curator`; `skills.py` kiest automatisch; `skills:`-preload per agent | `validate.py` controleert koppelingen |
| Sequential-agent | `pipeline.py`, 7 vaste fasen, context-overdracht, herstel-lus | Volgorde en QA-poort hard in code |
| Parallel-agent | `taskboard.py`: claims, padconflicten, dubbelwerkdetectie, afhankelijkheden, merge; agents gelijktijdig gestart | `fcntl`-lock, atomaire plannen |
| Router-agent | `router.py` (deterministisch, gratis) + `router`-agent (semantische correctie, alleen-lezen) | Router heeft geen schrijf-/delegatietools |
| Human-in-the-loop | `approval-gate` (bereidt voor, voert nooit uit) + `hitl_guard.py` | PreToolUse `ask` voor e-mail, betaling, budget, publicatie, verwijderen, productie, delen, betaalde generatie |
| Orchestrator | `ceo` (+ `CLAUDE.md` voor de hoofdsessie, of `claude --agent ceo`) | Enige agent (naast project-manager) met de `Agent`-tool |

## Toegangsbeheer
- **Tools:** elke agent krijgt alleen de tools die zijn rol vereist (frontmatter `tools`). Schrijvende MCP-tools alleen bij de verantwoordelijke agent, en dan nog achter de HITL-hook.
- **Geheugen:** `memory/acl.json`, afgedwongen door `memory_acl.py` op Read/Write/Edit/Glob/Grep en Bash-paden. HR-data alleen hr+ceo, financiën alleen finance (+lezen sales/ceo), klantdata alleen klantgerichte agents.
- **Geheimen:** `.env`, sleutels en `secrets/` geblokkeerd voor iedereen (hook + `permissions.deny`), gitignored, en `quality_gate.py` scant op gelekte tokens.

## Kosten
Routering, skillselectie, pipelines, taakborden, berekeningen en validatie zijn lokale Python-scripts: geen tokens. Router draait op `haiku`, de CEO erft het sessiemodel, specialisten op `sonnet`. Betaalde MCP-aanroepen worden gelogd in `logs/costs.jsonl` en betaalde generaties vragen toestemming.

## Uitbreiden
- **Nieuwe agent:** maak `.claude/agents/<naam>.md` (zie bestaande als sjabloon, inclusief het gedeelde werkcontract) en voeg hem toe aan `workflows/registry.json` (afdeling + trefwoorden + skills). Draai daarna `validate.py`.
- **Nieuwe skill:** skill `skill-authoring`.
- **Nieuwe integratie:** skill `integration-check`, `docs/INTEGRATIONS.md`.
