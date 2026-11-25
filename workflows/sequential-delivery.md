# Workflow: Sequentiële oplevering (Sequential-agent)

**Wanneer:** iets bouwen of ontwikkelen waarbij elke stap voortbouwt op de vorige (website, app, script, integratie, rapport met ontwerp).

```
Opdracht analyseren -> Onderzoek -> Ontwerp -> Ontwikkeling -> Testen -> Kwaliteitscontrole -> Oplevering
 project-manager      research    ui-ux     software-dev     qa         qa (+security)       project-manager
                                            /frontend/backend                    |
                                                    ^------- AFGEKEURD ----------+
```

## Uitvoering door de orchestrator (CEO of project-manager)
1. `python3 workflows/engine/pipeline.py start "<opdracht>" --id <ID>` (optioneel `--skip onderzoek,ontwerp` met reden).
2. Herhaal tot klaar:
   1. `pipeline.py next <ID>` -> JSON met `fase`, `agent`, `instructie`, `context`.
   2. Delegeer met de Agent-tool aan `agent` met als prompt: instructie + context + acceptatiecriteria + paden die gewijzigd mogen worden.
   3. Controleer `STATUS:` in het antwoord. `GEBLOKKEERD` -> oorzaak oplossen of `pipeline.py fail`; `TOESTEMMING_NODIG` -> `approval-gate` + gebruiker.
   4. Schrijf het antwoord naar een bestand en `pipeline.py complete <ID> <fase> --file <bestand>`.
3. Kwaliteitspoort: `oplevering` wordt door het script geweigerd tenzij `kwaliteitscontrole` `VERDICT: GOEDGEKEURD` bevat. Afkeuring heropent automatisch ontwikkeling/testen/kwaliteitscontrole.
4. Oplevering aan de gebruiker met bewijs (`python3 workflows/engine/quality_gate.py --task <ID>`).

## Overdracht
Elke fase ontvangt via `context` de **volledige output van alle eerdere fasen**; outputs worden bewaard in `memory/tasks/<ID>/NN-<fase>.md` (taakgeschiedenis) en events in `logs/pipeline.jsonl`.
