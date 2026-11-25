---
name: skill-authoring
description: "Hoe je een nieuwe herbruikbare Claude Skill (SKILL.md) maakt of verbetert voor een bedrijfsspecifiek werkproces, en koppelt aan agents. Gebruik wanneer een werkwijze vaker terugkomt en vastgelegd moet worden, of een bestaande skill niet goed werkt."
allowed-tools: Bash(python3 workflows/engine/validate.py) Bash(python3 workflows/engine/skills.py *)
---
# Skills maken en onderhouden

## Structuur
```
.claude/skills/<naam>/
  SKILL.md          # verplicht
  reference.md      # optioneel: lange naslag, wordt alleen gelezen als nodig
  scripts/          # optioneel: deterministische hulpscripts
```

## SKILL.md
```markdown
---
name: <naam-in-kebab-case, gelijk aan map>
description: <Wat de skill doet. Gebruik wanneer ...> (max ~1000 tekens; dit bepaalt automatische selectie)
allowed-tools: Bash(python3 pad/script.py *)   # optioneel, alleen wat nodig is
---
# Titel
Stappen, regels, sjablonen, voorbeelden.
```

## Kwaliteitsregels
- Eén werkproces per skill; houd SKILL.md onder ~200 regels, verplaats naslag naar losse bestanden.
- Beschrijving bevat concrete trefwoorden die gebruikers zeggen (in het Nederlands) + "Gebruik wanneer ...".
- Bedrijfsspecifieke feiten (prijzen, toon) verwijzen naar `memory/company/bedrijfskennis.md` in plaats van te dupliceren.
- Berekeningen en controles in scripts, niet in proza.

## Na het maken
1. Koppel aan agent(s): `workflows/registry.json` -> `agents.<agent>.skills` en eventueel `skills:` in `.claude/agents/<agent>.md`.
2. Controleer selectie: `python3 workflows/engine/skills.py "<typische opdracht>"`.
3. Valideer: `python3 workflows/engine/validate.py`.
