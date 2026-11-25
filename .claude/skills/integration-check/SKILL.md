---
name: integration-check
description: "Detecteert en test welke integraties (MCP-servers, claude.ai-connectors, plugins, API-sleutels, CLI-tools) echt beschikbaar zijn, zonder fictieve verbindingen of onveilig opgeslagen sleutels. Gebruik voordat een agent een integratie gebruikt, bij het toevoegen van een nieuwe koppeling of bij verbindingsfouten."
allowed-tools: Bash(python3 workflows/engine/integrations.py *)
---
# Integraties controleren

1. **Lokaal detecteren** (leest alleen namen, nooit waarden van sleutels):
   ```bash
   python3 workflows/engine/integrations.py
   ```
2. **Connectors (claude.ai)** verifiëren in de hoofdsessie: `ListConnectors` en per connector één **gratis alleen-lezen** smoke test:
   GitHub `get_me` · Shopify `get-shop-info` · Metricool `getBrandSettings` · Google Drive `list_recent_files` (pageSize 1) · Figma `whoami`.
   Betaalde diensten (Semrush, Firecrawl, generaties) niet testen zonder reden.
3. **Status bijwerken** in `workflows/integrations.json` (`werkt` alleen na een geslaagde test, met datum).
4. **Nieuwe integratie toevoegen:**
   - Bij voorkeur als claude.ai-connector (Instellingen > Connectors) - sleutels blijven dan buiten de repo.
   - Of als project-MCP-server in `.mcp.json` met `${VAR}` voor sleutels, na toestemming van de gebruiker.
   - Voeg tool-rechten toe aan de juiste agent(s) en draai `python3 workflows/engine/validate.py`.
5. **Niet verbonden?** Meld het eerlijk en bied het alternatief aan; bouw nooit een workflow op een niet-geteste verbinding.
