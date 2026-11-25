---
name: task-routing
description: "Routeert een opdracht naar de juiste afdeling, agent(s), skills en tools en bepaalt of toestemming nodig is. Gebruik aan het begin van elke nieuwe opdracht, of wanneer onduidelijk is welke agent verantwoordelijk is."
allowed-tools: Bash(python3 workflows/engine/router.py *)
---
# Opdrachten routeren

1. Draai de deterministische router (gratis, geen API-kosten):
   ```bash
   python3 workflows/engine/router.py "<opdracht>"
   ```
2. Beoordeel de uitkomst:
   - `zekerheid: laag` -> de CEO beslist; vraag de gebruiker om verduidelijking als het doel onduidelijk is.
   - Klopt `primaire_agent` met de *bedoeling* (niet alleen de woorden)? Let op ontkenningen ("niet publiceren"), impliciete publicatie ("zet het op Instagram") en meerdere doelen in één zin.
3. Kies de samenwerkingsvorm:
   | Situatie | Vorm | Workflow |
   |---|---|---|
   | Eén specialist kan het alleen | `single` | direct delegeren |
   | Iets bouwen/ontwikkelen met fasen die op elkaar voortbouwen | `sequential` | `workflows/sequential-delivery.md` |
   | Onafhankelijke deeltaken (bijv. SEO + social + video voor één lancering) | `parallel` | `workflows/parallel-fanout.md` |
4. `toestemming_nodig: true` -> plan een moment met `approval-gate` vóór de uitvoerende stap.
5. Afdelingen en agents staan in `workflows/registry.json`. Nieuwe trefwoorden toevoegen? Pas het register aan en draai `python3 -m unittest tests.test_router`.
