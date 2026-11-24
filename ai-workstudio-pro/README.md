# AI WorkStudio Pro

Nederlandstalige AI-werkplek voor bedrijven: **AI Chat** met echte slash-opdrachten, een **Schrijfstudio** met huisstijl en goedkeuring, en **AI Code** – projecten, editor, terminal in een afgeschermde sandbox, Git en AI-codetaken. Daarnaast de bestaande engineering-modules: LLM Studio, Prompt Studio, App Builder, Tools & Integraties, RAG-kennisbank, agents, multi-agent orchestratie, workflows en een 3D AI-kantoor.

Gebouwd met Next.js 15 · React 19 · TypeScript · Tailwind CSS 4 · CodeMirror 6 · PostgreSQL 16 + pgvector · Docker-sandbox · officiële Anthropic- en OpenAI-SDK's.

- Voortgang, openstaande punten en blokkades: **[PROGRESS.md](PROGRESS.md)**
- Implementatieplan en architectuur: **[docs/IMPLEMENTATIEPLAN.md](docs/IMPLEMENTATIEPLAN.md)**
- Bestaande modules in detail: **[apps/web/README.md](apps/web/README.md)**

---

## Wat werkt (fase 1 en 3)

| Onderdeel | Mogelijkheden |
|---|---|
| **AI Chat** | Gesprekken met streaming, model- en stijlkeuze, projectkoppeling, zoeken, export (Markdown). Slash-opdrachten met autocomplete: `/email` `/reply` `/rewrite` `/humanize` `/translate engels` `/summarize` `/analyze` `/create` `/excel` `/code` `/browser`. Bestanden toevoegen met de paperclip of door te slepen. Elke opdracht heeft een eigen server-side handler. E-mails worden nooit automatisch verstuurd. |
| **Schrijfstudio** | Schrijfstijlen per organisatie (standaard: *natuurlijk, kort, vriendelijk en professioneel*), persoonlijke instructies, documenten met versies, terugzetten, delen, goedkeuren, archiveren en export (.md, .txt, printbare .html). |
| **Cowork** | Bestanden in AI Chat (PDF, Word, Excel, CSV, tekst) samenvatten, analyseren of omzetten; `/excel` maakt een echt Excel-bestand; elk antwoord en document als Word of PDF; taakplanner die dagelijks, wekelijks of maandelijks een concept klaarzet. |
| **AI Code** | Projecten uit een sjabloon of openbare Git-repository, bestandsboom en editor, terminal in Docker zonder netwerk, Git (status, diff, branch, commit), AI-codetaken met plan, stappenlog, tests in de sandbox, gewijzigde bestanden en diff. Pakketinstallaties alleen na jouw toestemming. |
| **Workspaces** | Clean Schoonmaakbedrijf B.V. en NobleNest.nl volledig gescheiden (Row Level Security per organisatie). |

Niet-gebouwde onderdelen (Chrome-extensie, AI Browser, GitHub OAuth) worden in de app eerlijk als "nog niet beschikbaar" getoond, met wat er ontbreekt – nooit gesimuleerd.

## Monorepo

```
ai-workstudio-pro/
  apps/web/                 Next.js: UI, API-routes (/api/w/[org]/…), migraties, worker, tests
  packages/shared/          Slash-opdrachten, zod-contracten, gedeelde typen
  packages/code-execution/  Werkmap-beveiliging, Docker-sandbox, Git, projectsjablonen
  packages/document-engine/ Word (.docx), PDF en Excel (.xlsx) maken; Excel lezen
  docs/                     Implementatieplan
  PROGRESS.md               Voortgang
```

## Installatie

Vereisten: **Node.js 22+**, **PostgreSQL 15/16 met pgvector**, **Docker** (voor AI Code-commando's en -taken), **git**.

```bash
cd ai-workstudio-pro
npm install                                   # alle workspaces
cp apps/web/.env.example apps/web/.env        # vul DATABASE_URL en APP_ENCRYPTION_KEY in
npm run db:migrate                            # tabellen, functies, RLS-policies
docker pull node:22-alpine                    # sandbox-image voor AI Code
npm run dev                                   # web (http://localhost:3000) + job-worker
```

Open http://localhost:3000 → **Installatie** maakt het eerste beheerdersaccount en je workspace aan. Optioneel de Clean-, NobleNest- en demo-workspaces:

```bash
SEED_ADMIN_EMAIL=… SEED_ADMIN_PASSWORD=… npm run db:seed
```

PostgreSQL + pgvector via Docker:

```bash
docker run -d --name ai-studio-db -p 5432:5432 -e POSTGRES_USER=studio -e POSTGRES_PASSWORD=studio -e POSTGRES_DB=ai_studio pgvector/pgvector:pg16
```

**Docker-image niet bereikbaar (rate limit van Docker Hub)?** Haal het via een mirror en tag het:

```bash
docker pull mirror.gcr.io/library/node:22-alpine && docker tag mirror.gcr.io/library/node:22-alpine node:22-alpine
```

### Productie

```bash
npm run build
npm run start            # webserver op poort 3000
npm run worker           # job-worker als apart proces (of RUN_WORKER_IN_WEB=true voor één container)
```

Zet in productie `ENABLE_DEMO_PROVIDER=false`, gebruik https in `APP_URL`, een vast `WORKSPACE_ROOT`-volume en een Docker-host die alleen voor de sandbox wordt gebruikt.

## Eerste route

1. **Inloggen** → je komt direct in **AI Chat**.
2. **AI-provider koppelen**: Instellingen → AI-providers (Anthropic of OpenAI). Zonder sleutel kun je alles doorlopen met de demo-simulator; die antwoorden zijn gemarkeerd als **DEMO**.
3. **Schrijfopdracht**: typ `/email aan een nieuwe klant met een bevestiging van de intake`.
4. **Opslaan**: *Opslaan als document* → de tekst staat als concept in de **Schrijfstudio**; keur hem daar goed.
5. **Project openen**: AI Code → *Nieuw project* → sjabloon *Node.js-voorbeeld*.
6. **AI Code-taak**: beschrijf de wijziging (bijv. een kortingsfunctie met test) en klik *Start*, of koppel het project aan een chat en gebruik `/code …`.
7. **Resultaten**: plan, elke stap, testuitvoer uit de sandbox, gewijzigde bestanden en de diff. Commit zelf via het Git-tabblad.

### Taakplanner

Cowork → Taakplanner → *Nieuwe taak*: kies een opdracht (bijv. `/create nieuwsbrief …` of `/excel urenoverzicht …`), herhaling en tijd. De worker (`npm run worker`, of `RUN_WORKER_IN_WEB=true`) voert de taak op het juiste moment uit; het resultaat staat als concept in de Schrijfstudio of bij Cowork → Bestanden. Er wordt nooit automatisch iets verstuurd.

## Scripts (vanuit `ai-workstudio-pro/`)

| Script | Doel |
|---|---|
| `npm run dev` | Webserver + worker (ontwikkeling) |
| `npm run build` / `npm run start` | Productiebuild / starten |
| `npm run worker` | Job-worker |
| `npm run db:migrate` / `npm run db:seed` | Migraties / voorbeeldworkspaces |
| `npm run typecheck` | TypeScript in alle workspaces |
| `npm test` | Unit- en integratietests (database `ai_studio_test`, Docker voor sandboxtests) |
| `npm run test:e2e` | Playwright end-to-end (eerst `npm run build`; database `ai_studio_e2e`) |

## Configuratie AI Code

| Variabele | Standaard | Betekenis |
|---|---|---|
| `WORKSPACE_ROOT` | `apps/web/.workspaces` | Map met projectwerkmappen (`<org>/<project>`) |
| `SANDBOX_IMAGE` | `node:22-alpine` | Container-image voor commando's |
| `SANDBOX_TIMEOUT_MS` / `SANDBOX_MEMORY_MB` / `SANDBOX_CPUS` | 180000 / 1536 / 1 | Limieten per commando |
| `SANDBOX_PASS_PROXY` | `false` | Proxy doorgeven bij toegestane installaties |
| `GIT_ALLOWED_HOSTS` | `github.com,gitlab.com,bitbucket.org` | Hosts voor klonen (alleen https, zonder inloggegevens in de URL) |
| `CODE_TASK_MAX_MINUTES` | `20` | Maximale actieve duur van een AI Code-taak |
| `RUN_WORKER_IN_WEB` | `false` | Worker in het webproces draaien |

## Beveiliging

- **Geen stille externe acties**: e-mails worden alleen als concept gemaakt; installaties met netwerk, verwijderen en Git-acties vragen een expliciete handeling of goedkeuring en worden gelogd in het auditlog.
- **Sandbox**: `--network none`, `--cap-drop ALL`, `no-new-privileges`, alleen-lezen root, tmpfs, CPU-/geheugen-/proceslimieten, niet-root gebruiker; container- en rechtenopdrachten (docker, sudo, mount …) geweigerd.
- **Werkmappen**: paden alleen binnen het project; `..`, `.git` en symbolische links naar buiten worden geweigerd. Git draait zonder hooks en met beperkte protocollen.
- **Prompt-injectie**: geplakte teksten, bestandsinhoud en commando-uitvoer gaan als gemarkeerde data naar het model; instructies daarin worden niet als opdracht van de gebruiker behandeld.
- **Scheiding**: Row Level Security per organisatie; gesprekken en documenten privé per gebruiker tenzij gedeeld.
- **Geheimen**: API-sleutels AES-256-GCM-versleuteld; nooit in de broncode of in `.env.example`.

## Chrome-extensie "AI WorkStudio Assistant"

**Status: nog niet gebouwd (fase 5).** Zodra `apps/chrome-extension` is opgeleverd, verloopt de installatie zo:

1. `npm run build -w @workstudio/chrome-extension` (maakt `apps/chrome-extension/dist`).
2. Chrome → `chrome://extensions` → *Ontwikkelaarsmodus* aan → *Uitgepakte extensie laden* → kies `apps/chrome-extension/dist`.
3. Open het zijpaneel via het extensie-icoon en log in met je AI WorkStudio Pro-account.

De extensie krijgt alleen minimale rechten (`sidePanel`, `activeTab`, `contextMenus`, `storage`, `scripting`) en geen brede host-permissies. Tot die fase is er geen werkende extensie; de app meldt dit ook zo.
