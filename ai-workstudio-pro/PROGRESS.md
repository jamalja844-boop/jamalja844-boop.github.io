# Voortgang – AI WorkStudio Pro

Laatst bijgewerkt: 24 november 2026 · Plan: [docs/IMPLEMENTATIEPLAN.md](docs/IMPLEMENTATIEPLAN.md)

## Samenvatting

**Fase 1 en fase 3 (Cowork) zijn gereed en getest.** Fase 3 voegt toe: bijlagen in AI Chat (PDF, Word, Excel, CSV, tekst), Word-/PDF-/Excel-export, de opdracht `/excel` en een taakplanner die op vaste momenten concepten klaarzet.

**Fase 1:** De verplichte eerste route werkt end-to-end in een productiebuild:
inloggen → AI Chat → schrijfopdracht (`/email`) → opslaan als document → goedkeuren → project openen → `npm test` in de sandbox → AI Code-taak → resultaten (stappen, gewijzigde bestanden, diff).

Tests: **122 automatische tests groen** – 109 unit/integratie (Vitest, echte PostgreSQL en Docker) en 13 end-to-end (Playwright, productiebuild).

## Afgerond

### Fundament
- [x] Bestaande applicatie geanalyseerd en hergebruikt; verplaatst naar monorepo `ai-workstudio-pro/` (npm workspaces: `apps/web`, `packages/shared`, `packages/code-execution`)
- [x] Rebranding naar AI WorkStudio Pro; nieuwe navigatie (Werken · Automatiseren · Kennis & koppelingen · Beheer); inloggen opent AI Chat
- [x] Migratie `0006_workstudio_chat_code.sql`: nieuwe rechten, tabellen en RLS-policies
- [x] Dashboard toont de nieuwe eerste route als voortgang
- [x] Job-worker herbruikbaar (`lib/jobs/worker.ts`); optioneel in het webproces (`RUN_WORKER_IN_WEB=true`)

### AI Chat
- [x] Gesprekken (privé, zoeken, verwijderen, exporteren als Markdown), modelkeuze, schrijfstijl en projectkoppeling per gesprek
- [x] Slash-opdrachten met autocomplete en echte server-side handlers: `/email` `/reply` `/rewrite` `/humanize` `/translate` `/summarize` `/analyze` `/create` `/code` `/browser`
- [x] E-mailkaart (onderwerp + tekst), kopiëren, opslaan als document; nooit automatisch verzonden
- [x] `/code` start een echte AI Code-taak met live voortgang in de chat
- [x] `/browser` meldt eerlijk wat ontbreekt (geen simulatie)
- [x] Geplakte tekst wordt als onbetrouwbare data behandeld (prompt-injectiebeleid)

### Schrijfstudio
- [x] Schrijfstijlen per organisatie (standaard: natuurlijk, kort, vriendelijk en professioneel), beheer voor eigenaar/beheerder
- [x] Persoonlijke instructies, voorkeursstijl en standaardtaal per gebruiker
- [x] Documenten met versiegeschiedenis, versie bekijken/terugzetten, delen, archiveren, verwijderen
- [x] Goedkeuren vóór extern gebruik; wijzigen na goedkeuring zet terug naar concept
- [x] Export: Markdown, tekst, printbare HTML (→ PDF via de browser)

### AI Code
- [x] Projecten uit sjabloon (Node.js-offertecalculator met tests, of leeg) of openbare https-Git-repository van toegestane hosts
- [x] Bestandsboom, CodeMirror-editor (syntaxkleuring, Ctrl+S), nieuw/verwijderen
- [x] Terminal in Docker-sandbox: geen netwerk, geen rechten, alleen-lezen systeem, limieten; installaties alleen na expliciete toestemming (met audit)
- [x] Git: status, gekleurde diff, branches maken/wisselen, commit met de naam van de gebruiker, log
- [x] AI Code-taken: plan → bestanden lezen/wijzigen → testen in sandbox → diff en samenvatting; pauze + goedkeuring voor installaties; annuleren; limieten op stappen en tijd; alle stappen en commando's gelogd
- [x] Projecten en taken strikt gescheiden per organisatie (RLS + UUID-paden)

### Cowork (fase 3)
- [x] `packages/document-engine`: Markdown → Word (.docx) en PDF (A4, koptekst met bedrijfsnaam, paginanummers, tabellen), tabellen → Excel (opgemaakte kopregel, filters, Nederlandse getalnotatie), Excel inlezen
- [x] Bijlagen in AI Chat via paperclip of slepen: PDF, Word, Excel, CSV, TXT, Markdown, JSON, HTML; controle op type en inhoud; alleen de tekst wordt bewaard (privé); verdachte instructies in bestanden worden gemarkeerd en als data behandeld
- [x] Opdrachten werken op bijlagen: `/summarize`, `/analyze`, `/translate`, `/rewrite` zonder tekst gebruiken de bijlage; snelknoppen *Samenvatten*, *Analyseren*, *Naar Excel*
- [x] `/excel`: AI maakt een echt Excel-bestand (ook uit bijlagen), met voorbeeld in de chat en downloadkaart
- [x] Elk AI-antwoord downloaden als Word of PDF; Schrijfstudio-export naar Word, PDF en Excel (tabellen)
- [x] Taakplanner: eenmalig, dagelijks, werkdagen, wekelijks, maandelijks; Nederlandse tijd incl. zomer-/wintertijd; *Nu uitvoeren*; geschiedenis met links naar concept, bestand en gesprek; aan/uit; `/code` en `/browser` kunnen niet worden ingepland; resultaat is altijd een concept
- [x] Cowork-pagina met gemaakte bestanden en bijlagen; kennisbank accepteert nu ook Excel
- [x] Migratie `0007_cowork.sql` met RLS: bijlagen, bestanden en planningen alleen zichtbaar voor de eigenaar

### Kwaliteit
- [x] Unit-tests: slash-opdrachten, e-mailparser, padbeveiliging, symbolische links, sandboxregels, demo-scripts, Word/PDF/Excel-generatie (teruggelezen), planning incl. zomertijd
- [x] Integratietests Cowork: bijlagen (CSV, Excel, vermomde bestanden, injectiemarkering, privacy), `/summarize` op bijlage, `/excel`, automatische en handmatige geplande runs zonder dubbele uitvoering, privé per gebruiker
- [x] E2E Cowork: CSV-bijlage → Excel downloaden, Word/PDF-export, taak inplannen → nu uitvoeren → concept openen
- [x] Integratietests: RLS documenten/projecten, versies en goedkeuring, alle chatopdrachten, sjabloonproject, sandbox zonder netwerk, AI Code-taak, pauze/weigering bij installatie
- [x] E2E: eerste route (A–C) + mobiele weergave (D); bestaande 6 e2e-tests blijven groen
- [x] Gevonden en opgelost tijdens testen: testscript sjabloon (Node 22), `.git` zichtbaar in bestandsboom, horizontaal scrollen op mobiel, overlappende panelen op mobiel, edge-bundeling van de worker-hook, twee randgevallen met symbolische links (map aanmaken vóór controle; schrijven via een hangende link), een race condition waardoor een nieuw chatgesprek soms het eerste antwoord niet toonde (ook in LLM Studio), en nieuwe beveiligingsmeldingen in Vitest en `uuid` (bijgewerkt; `npm audit`: 0 kwetsbaarheden)

## Openstaand (volgende fases)

| Fase | Onderdeel | Wat er nog moet gebeuren |
|---|---|---|
| 2 | GitHub-koppeling | OAuth-app, privérepo's klonen, push, pull requests, branch per taak |
| 3 | Cowork (rest) | Spellingscontrole in de Schrijfstudio; OCR voor gescande PDF's; meldingen per e-mail bij afgeronde geplande taken (na koppeling e-mail) |
| 4 | Integration Manager / MCP | Beheer per workspace, e-mail versturen na goedkeuring (Gmail/Microsoft 365), Shopify-productbeheer |
| 5 | Chrome-extensie | `apps/chrome-extension` (MV3, side panel, contextmenu, `activeTab`, minimale host-permissies, native messaging) |
| 6 | AI Browser | Playwright in een aparte, afgeschermde dienst (`packages/browser-automation`), toestemming per domein, bevestiging vóór formulieren/aankopen |
| 7 | Business workspaces | Clean: CRM, planning, uren, kwaliteit; NobleNest.nl: Shopify-producten, SEO, social – bovenop de bestaande agents |
| 8 | Platform | Packages extraheren (`ai-providers`, `security`, `agent-runtime`, `tool-registry`, `ui`), losse `apps/api` en `apps/worker`, Tauri-desktop, Supabase-Auth-adapter |

## Technische blokkades en aandachtspunten

- **AI-sleutels**: in deze ontwikkelomgeving zijn geen Anthropic/OpenAI-sleutels beschikbaar. Alle tests gebruiken de demo-simulator (duidelijk gemarkeerd als *DEMO*); de echte adapters zijn eerder getest met gesimuleerde SDK-streams. Koppel een sleutel onder Instellingen → AI-providers voor echte antwoorden en AI Code-taken.
- **Docker vereist voor AI Code**: de server (of worker) moet Docker kunnen aanroepen en het image `node:22-alpine` (of `SANDBOX_IMAGE`) hebben. Zonder Docker toont de app dat duidelijk; bestanden bewerken werkt dan wel.
- **Netwerk bij installaties**: na toestemming krijgt alleen dat commando netwerk (`--network bridge`). Achter een bedrijfsproxy: `SANDBOX_PASS_PROXY=true`.
- **Chrome-extensie**: nog niet gebouwd (fase 5). Er zijn daarom nog geen installatie-instructies die werken; zie de hoofd-README voor de geplande installatieprocedure.
- **Sandbox-isolatie**: Docker-containers delen de kernel met de host. Voor multi-tenant productie met onbekende code: gVisor (`--runtime=runsc`) of microVM's (Firecracker) overwegen.
