# Gebruik

## Starten
- Nieuwe sessie in deze repo → agents en skills worden automatisch geladen (`/agents` toont ze).
- Orchestrator als hoofdagent: `claude --agent orchestrator` — of gewoon je opdracht typen; CLAUDE.md routeert.
- Specialist direct: "Gebruik de lead-finder om …" of `@lead-finder …`.

## Voorbeeldopdrachten
- "Zoek nieuwe zakelijke klanten voor mijn schoonmaakbedrijf in Utrecht en Amersfoort" → workflow `lead-generation`
- "Maak de Instagram- en Facebookplanning voor Clean voor december" → content-strategist → social-media-manager
- "Analyseer noblenest.nl en verbeter de productpagina's" → website-designer
- "Wekelijks concurrentierapport elke maandag" → automation-manager maakt (na akkoord) een geplande taak
- "Beantwoord deze offerteaanvraag: …" → campaign-manager (+ compliance-check)

## Goedkeuren
De orchestrator toont een tabel met voorgestelde externe acties. Antwoord met "akkoord 1, 3" of "akkoord alles". Zonder akkoord gebeurt er niets extern.

## Onderhoud
- Merkgegevens bijwerken in `memory/brands/` (vul alle `TE BEVESTIGEN`-velden).
- Na wijzigingen: `python3 tests/validate_agents.py && python3 -m unittest tests/test_leads_tool.py`.
