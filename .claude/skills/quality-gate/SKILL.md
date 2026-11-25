---
name: quality-gate
description: "Checklist en procedure voor automatische kwaliteitscontrole van elk resultaat: correctheid, volledigheid, beveiliging, prestaties, onderhoudbaarheid, werkende functionaliteit, mogelijke fouten en onnodige API-kosten. Gebruik vóór elke oplevering en in de test- en kwaliteitscontrolefase."
allowed-tools: Bash(python3 workflows/engine/quality_gate.py *)
---
# Kwaliteitspoort

Een opdracht is pas klaar als het resultaat **daadwerkelijk** is gecontroleerd. Lezen alleen is geen controle.

## Checklist
| # | Criterium | Hoe controleren |
|---|---|---|
| 1 | Correctheid | Tests draaien, getallen herrekenen met Python, feiten tegen bron checken |
| 2 | Volledigheid | Elk acceptatiecriterium uit de analyse afvinken |
| 3 | Beveiliging | Geen geheimen, invoervalidatie, rechten minimaal; bij code/data: `security`-agent |
| 4 | Prestaties | Laadtijd/grootte/complexiteit redelijk; geen onnodige afhankelijkheden |
| 5 | Onderhoudbaarheid | Leesbaar, volgt conventies, gedocumenteerd waar nodig |
| 6 | Werkende functionaliteit | Daadwerkelijk uitvoeren: script draaien, pagina openen (Playwright), link volgen |
| 7 | Mogelijke fouten | Randgevallen, lege invoer, foutpaden |
| 8 | API-kosten | Geen herhaalde/onnodige betaalde aanroepen; zie `logs/costs.jsonl` |
| 9 | Toon & taal | Nederlands, passend bij merk (zie bedrijfskennis) |
| 10 | Toestemming | Externe acties alleen na expliciet akkoord |

## Repository-wijzigingen
```bash
python3 workflows/engine/quality_gate.py            # config + unittests + geheimenscan + kosten
python3 workflows/engine/quality_gate.py --task ID  # + QA-verdict van pipeline-taak
```

## Verdict
Eindig met precies één regel: `VERDICT: GOEDGEKEURD` of `VERDICT: AFGEKEURD` + genummerde herstelpunten.
