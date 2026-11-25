---
name: parallel-fanout
description: "Verdeelt een complexe opdracht over meerdere gespecialiseerde agents die tegelijk werken, voorkomt conflicten en dubbel werk via een taakbord met bestandsclaims, en voegt de resultaten automatisch samen. Gebruik bij onafhankelijke deeltaken zoals een campagne (SEO + social + video) of een audit over meerdere gebieden."
allowed-tools: Bash(python3 workflows/engine/taskboard.py *)
---
# Parallel uitwaaieren en samenvoegen

Volledige beschrijving: `workflows/parallel-fanout.md`.

1. **Opsplitsen** in deeltaken die echt onafhankelijk zijn. Elke deeltaak krijgt: `id`, `titel`, `agent`, `paden` (bestanden/mappen die alleen deze taak mag schrijven), optioneel `afhankelijk_van`.
2. **Plannen** (weigert dubbel werk en overlappende paden):
   ```bash
   python3 workflows/engine/taskboard.py plan <BOARD> plan.json
   ```
3. **Claimen + starten:** claim elke taak (`taskboard.py claim <BOARD> <TAAK> <agent>`) en start **alle onafhankelijke subagents in één bericht** (meerdere Agent-aanroepen tegelijk) zodat ze gelijktijdig draaien. Geef elke agent alleen zijn eigen taak, paden en benodigde context.
4. **Resultaat vastleggen:** `taskboard.py done <BOARD> <TAAK> --file <output.md>`; bij fout `taskboard.py fail ...` (taak komt weer vrij).
5. **Samenvoegen:** `taskboard.py merge <BOARD>` -> `memory/tasks/<BOARD>/merged.md`. Controleer daarna op tegenstrijdigheden tussen de resultaten (bijv. verschillende prijzen of tone of voice) en los die op.
6. **Kwaliteit:** laat `qa` het samengevoegde resultaat beoordelen.
