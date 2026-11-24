# AI WorkStudio Pro – technisch implementatieplan

Dit plan is opgesteld na analyse van de bestaande projectmap (`ai-engineering-studio`, een werkende Next.js/PostgreSQL-applicatie met 66 groene tests). Uitgangspunt: **bestaande, werkende onderdelen hergebruiken en uitbreiden**, niets opnieuw bouwen wat al veilig werkt, en geen gesimuleerde integraties in productie.

## 1. Analyse van de bestaande applicatie

| Onderdeel | Status bij de start | Hergebruik |
|---|---|---|
| Authenticatie (scrypt, gehashte sessies, CSRF, rate limiting) | Werkend, getest | Volledig hergebruikt |
| Organisaties, rollen, rechtenmatrix, Row Level Security | Werkend, getest | Uitgebreid met `writing.use`, `styles.manage`, `code.use`, `code.manage` |
| AI-provideradapters (Anthropic, OpenAI, demo) + kostenregistratie | Werkend | Gebruikt door AI Chat, schrijfopdrachten en AI Code |
| Chatmotor met tools, RAG en goedkeuringen | Werkend | Uitgebreid met extra systeeminstructies (schrijfstijl) |
| Tool registry, goedkeuringen, auditlog, prompt-injectiebeleid | Werkend | Goedkeuringen uitgebreid met `code_command` |
| Postgres-jobqueue + worker | Werkend | Nieuw jobtype `code.run`; worker ook in-process mogelijk |
| Agents, orchestrator, workflows, 3D-kantoor, Clean/NobleNest-workspaces | Werkend | Ongewijzigd behouden |

## 2. Doelarchitectuur (monorepo)

```
ai-workstudio-pro/
  apps/
    web/                 Next.js 15: UI + API-routes (/api/w/[org]/…) + worker-script   ← gebouwd
    api/                 Losse API-service (nu: Next.js route handlers in apps/web)     ← fase 8
    worker/              Losse worker-container (nu: apps/web/scripts/worker.ts)        ← fase 8
    chrome-extension/    Manifest V3 "AI WorkStudio Assistant"                          ← fase 5
    desktop/             Tauri-shell                                                     ← fase 8
  packages/
    shared/              Contracten (zod), slash-opdrachten, typen                       ← gebouwd
    code-execution/      Werkmap, Docker-sandbox, Git                                    ← gebouwd
    ai-providers/ security/ agent-runtime/ tool-registry/                                ← extractie uit apps/web/src/lib (fase 8)
    document-engine/ browser-automation/ ui/                                             ← fase 3, 6, 8
```

Keuze: packages worden als TypeScript-bron gedeeld (`transpilePackages`), zonder aparte buildstap. Losse `apps/api` en `apps/worker` worden pas afgesplitst als schaal of deployment dat vraagt; tot die tijd draaien ze als routes en script binnen `apps/web` (geen lege façades).

## 3. Fasering

| Fase | Inhoud | Status |
|---|---|---|
| **1** | Monorepo, rebranding, **AI Chat** met echte slash-opdrachten, **Schrijfstudio** (stijlen, persoonlijke instructies, documenten met versies, goedkeuren, export), **AI Code** (projecten uit sjabloon/Git, editor, sandbox-terminal, Git-status/diff/branch/commit, AI-codetaken met plan, stappen, toestemming en diff), tests | **Gereed** |
| 2 | GitHub OAuth (privérepo's, push, pull requests), branch-per-taak, testresultaten in PR | Gepland |
| 3 | Cowork: bestandsuploads, DOCX/PDF/XLSX-generatie (document-engine), geplande taken in de UI | Gepland |
| 4 | Integration Manager + MCP-beheer per workspace (bestaande MCP-tool uitbreiden), e-mailverzending na goedkeuring | Gepland |
| 5 | Chrome-extensie MV3 (side panel, contextmenu, actieve tab, native messaging) | Gepland |
| 6 | AI Browser met Playwright in een aparte, afgeschermde dienst, toestemming per domein | Gepland |
| 7 | Workspaces Clean/NobleNest verdiepen (Shopify-productbeheer, CRM-schermen) | Gepland |
| 8 | Packages-extractie, `apps/api`, `apps/worker`, Tauri-desktop, Supabase-Auth-adapter, observability | Gepland |

## 4. Fase 1 – ontwerp

### AI Chat (`/w/[org]/chat`)
- Gesprekken van het type `chat` (privé per gebruiker, RLS), met model, schrijfstijl en optioneel gekoppeld project.
- Slash-opdrachten worden **server-side** herkend (`@workstudio/shared/parseSlashCommand`) en naar een eigen handler gestuurd (`apps/web/src/lib/chat/commands.ts`):
  - `/email`, `/reply` → gerichte LLM-aanroep met e-mailformaat → e-mailkaart (onderwerp + tekst). Er wordt **niets verstuurd**.
  - `/rewrite`, `/humanize`, `/translate [taal]`, `/summarize`, `/analyze` → werken op meegegeven tekst of het vorige antwoord; ingevoerde tekst wordt als *onbetrouwbare data* gemarkeerd (prompt-injectiebeleid).
  - `/create` → maakt direct een document in de Schrijfstudio.
  - `/code` → start een echte AI Code-taak in het gekoppelde project (rechtencontrole `code.use`).
  - `/browser` → eerlijke melding welke onderdelen (fase 5/6) ontbreken; er gebeurt niets.
- Gewone berichten lopen via de bestaande chatmotor, aangevuld met schrijfstijl en persoonlijke instructies.

### Schrijfstudio (`/w/[org]/writing`)
- `writing_styles` per organisatie (standaard: "Huisstijl: natuurlijk en professioneel" – natuurlijk, kort, vriendelijk en professioneel), `user_instructions` per gebruiker (eigen rij, RLS).
- `writing_documents` + `writing_document_versions`: privé of gedeeld, elke inhoudswijziging = nieuwe versie, goedkeuren/terug naar concept/archiveren; wijzigen na goedkeuring zet terug naar concept. Export: Markdown, tekst, printbare HTML.

### AI Code (`/w/[org]/code`)
- Projecten in `<WORKSPACE_ROOT>/<org-id>/<project-id>` (alleen UUID's, geen padinjectie); bron: sjabloon of openbare https-repository van een toegestane host.
- `@workstudio/code-execution`: padcontrole (geen `..`, geen `.git`, geen symlink-ontsnapping), Docker-sandbox (`--network none`, `--cap-drop ALL`, `no-new-privileges`, alleen-lezen root, tmpfs, CPU/geheugen/pids-limieten, niet-root gebruiker), Git met uitgeschakelde hooks en protocollen.
- AI-codetaak (jobtype `code.run`): plan (JSON-schema) → toolloop (`list_files`, `read_file`, `write_file`, `edit_file`, `search_code`, `run_command`, `git_status`, `git_diff`) → samenvatting met gewijzigde bestanden en diff. Installatiecommando's pauzeren de taak met een goedkeuringsverzoek (`code_command`); de starter of een beheerder beslist. Limieten: stappen, actieve tijd, annuleren. Commits blijven een handeling van de gebruiker.

## 5. Teststrategie
- Unit: slash-opdrachten, e-mailparser, padbeveiliging, sandboxregels, demo-scripts.
- Integratie (echte PostgreSQL + Docker): RLS op documenten en projecten, versies/goedkeuring, alle chatopdrachten, sjabloonproject met Git, sandbox zonder netwerk, AI Code-taak end-to-end, pauze en weigering bij installatie.
- E2E (Playwright, productiebuild): verplichte eerste route – inloggen → AI Chat → `/email` → opslaan → goedkeuren → project → `npm test` → AI Code-taak met diff → `/code` vanuit chat → dashboardvoortgang; plus mobiele weergave.
