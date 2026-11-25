---
name: sequential-delivery
description: "Vaste opleverworkflow in zeven fasen (analyse, onderzoek, ontwerp, ontwikkeling, testen, kwaliteitscontrole, oplevering) waarbij elke agent de resultaten van de vorige ontvangt. Gebruik voor bouwen/ontwikkelen van websites, apps, scripts, integraties of andere opleveringen die op elkaar voortbouwen."
allowed-tools: Bash(python3 workflows/engine/pipeline.py *)
---
# Sequentiële oplevering

Volledige beschrijving: `workflows/sequential-delivery.md`.

```bash
python3 workflows/engine/pipeline.py start "<opdracht>" --id <KORTE-ID>   # optioneel: --skip onderzoek,ontwerp
python3 workflows/engine/pipeline.py next <ID>      # -> fase, agent, instructie, context
# delegeer aan <agent> met instructie + context; sla de output op in een bestand
python3 workflows/engine/pipeline.py complete <ID> <fase> --file <output.md>
python3 workflows/engine/pipeline.py status <ID>
```

Regels die het script afdwingt:
- Fasen in vaste volgorde; een fase overslaan of vooruitlopen geeft een fout.
- `oplevering` kan pas als `kwaliteitscontrole` eindigt met `VERDICT: GOEDGEKEURD`.
- `VERDICT: AFGEKEURD` heropent automatisch ontwikkeling -> testen -> kwaliteitscontrole (herstel-lus). Stuur de QA-bevindingen mee.
- Fouten registreren: `pipeline.py fail <ID> <fase> "<reden>"` (komt in `memory/knowledge/errors.jsonl`).

Fase -> standaardagent: analyse=project-manager, onderzoek=research, ontwerp=ui-ux, ontwikkeling=software-developer (of frontend/backend/automation), testen=qa, kwaliteitscontrole=qa (+ security bij code), oplevering=project-manager. Een andere specialist mag een fase uitvoeren als die beter past; noteer dat in de output.
