# Integratiestatus (getest op 2026-11-25 met echte alleen-lezen calls)

| Integratie | Status | Getest met | Resultaat / benodigde actie |
|---|---|---|---|
| **Metricool** | ✅ werkt | `getBrandSettings`, `getScheduledPosts` | Brand "Clean schoonmaakbedrijf" (8165491): Facebook, TikTok, YouTube, GBP, FB Ads, Google Ads, TikTok Ads. **Instagram, LinkedIn, X niet gekoppeld** → koppel in Metricool. NobleNest heeft geen Metricool-brand. |
| **Shopify** | ✅ werkt | `get-shop-info` | NobleNest (noblenest.nl), plan Basic, EUR. |
| **Google Drive** (incl. Sheets lezen) | ✅ werkt (lezen) | `list_recent_files` | CRM-sheet "Clean AI Belassistent CRM" gevonden. Connector meldt `canEdit:false` → schrijven naar Sheets via deze connector niet mogelijk; geef rechten of koppel Google Sheets via Supermetrics/n8n. |
| **Figma** | ✅ werkt | `whoami` | Team "jamal jamal's team" (Full seat, starter). |
| **GitHub** | ✅ werkt | `get_me` | Account jamalja844-boop; scope: deze repository. |
| **Supermetrics** | ✅ werkt (deels) | `data_source_discovery` | Geauthenticeerd: **Facebook Ads, Google Ads**; Google Trends zonder login. Niet geauthenticeerd: Google Analytics (GAWA), Search Console (GW), Facebook Insights, Instagram Insights, LinkedIn Pages, TikTok Organic, YouTube, Google Sheets. Koppelen: https://hub.supermetrics.com/token-management |
| **Firecrawl** (web zoeken/scrapen) | ✅ werkt | `firecrawl_search`, `firecrawl_scrape` | Kost credits per call. |
| **OpenRush** (SEO/SERP) | ⚠️ deels | `list_connections` | Openbare SERP/keyword-tools beschikbaar; geen eigen GSC/GA4/Ads gekoppeld → https://openrush.com/dashboard/connections |
| **Semrush** | ❌ geen units | `domain_overview` | Account heeft geen API-units → https://www.semrush.com/mcp-access |
| Openart / Picsart / kloudboard / ElevenLabs / HyperFrames | ✅ verbonden (niet getest om credits te sparen) | — | Beeld/video/audio-generatie; kost credits — altijd vooraf akkoord. HyperFrames `compose`/`render` werkt niet vanuit Claude Code (alleen lezen). |
| **Google Chrome** | ✅ lokaal | Playwright + Chromium (`/opt/pw-browsers/chromium`) | Headless browser voor audits/screenshots. "Claude in Chrome" (je eigen browser) is in deze cloudsessie niet verbonden. |
| Google Analytics / Search Console | ❌ niet verbonden | — | Koppel via Supermetrics (GAWA/GW) of OpenRush. |
| Gmail / Outlook | ❌ niet verbonden | — | Voeg de Gmail- of Microsoft 365-connector toe in claude.ai → Instellingen → Connectors. Tot dan: concepten als bestand. |
| Google Calendar | ❌ niet verbonden | — | Google Calendar-connector toevoegen. |
| WhatsApp Business API | ❌ niet verbonden | — | Vereist Meta Business-verificatie + WhatsApp Cloud API-token (via beveiligde credential-opslag, host `graph.facebook.com`). |
| Meta Business (organisch) | ⚠️ via Metricool (Facebook) | — | Instagram koppelen in Metricool; Meta Ads leesbaar via Supermetrics. |
| TikTok / YouTube | ⚠️ via Metricool | — | Gekoppeld in Metricool voor Clean. |
| WordPress | ❌ niet verbonden | — | REST-API + applicatiewachtwoord (beveiligd opslaan) of WordPress MCP-server toevoegen in `.mcp.json`. |
| Canva | ❌ niet verbonden | — | Canva-connector toevoegen in claude.ai. Alternatief nu: Figma/Picsart. |
| Supabase | ❌ niet verbonden | — | Supabase MCP toevoegen (token via omgevingsvariabele). |
| n8n | ⚠️ bestaat, niet aan Claude gekoppeld | CRM-sheet (tab Gesprekken) | Er draait al een n8n-flow die naar het CRM-sheet schrijft (timeout-fouten in node "Lees Instellingen" gezien op 2026-11-25). Voor koppeling: n8n MCP-server-URL of webhook-URL + API-sleutel via beveiligde credential-opslag. |

## Een MCP-server toevoegen aan `.mcp.json` (voorbeeld, nog niet actief)
Voeg pas toe als de sleutel beschikbaar is; anders start de server niet. Sleutels **nooit** in dit bestand — gebruik `${VARIABELE}`:
```json
{ "mcpServers": {
  "supabase": { "command": "npx", "args": ["-y", "@supabase/mcp-server-supabase@<versie>", "--read-only"],
                "env": { "SUPABASE_ACCESS_TOKEN": "${SUPABASE_ACCESS_TOKEN}" } } } }
```
Verifieer pakketnaam en versie in de officiële documentatie van de leverancier voordat je dit toevoegt.
