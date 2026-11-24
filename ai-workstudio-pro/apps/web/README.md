# AI WorkStudio Pro – webapp (`apps/web`)

> Overzicht van het hele product, de monorepo, AI Chat, Schrijfstudio en AI Code: zie de [hoofd-README](../../README.md) en [PROGRESS.md](../../PROGRESS.md). Dit document beschrijft de bestaande engineering-modules van de webapp.

Nederlandstalig platform om eigen **AI-apps, AI-tools, AI-agents en samenwerkende AI-systemen** te bouwen, testen en beheren — met echte databaseopslag, echte provider-koppelingen (Anthropic Claude en OpenAI), Row Level Security en goedkeuringen voor gevoelige acties.

Gebouwd met Next.js 15 (App Router) · TypeScript · React 19 · Tailwind CSS 4 · Radix/shadcn-stijl componenten · React Flow · React Three Fiber · PostgreSQL 16 + pgvector · officiële Anthropic- en OpenAI-SDK's.

---

## Modules

| # | Module | Wat werkt |
|---|--------|-----------|
| 1 | **LLM Studio** | Chat met streaming, modelkeuze, systeeminstructies, prompt-templates, tools en kennisbanken per gesprek; gespreksgeschiedenis in de database; tokens en kosten per bericht; duidelijke melding als een sleutel ontbreekt. |
| 2 | **Prompt Engineering Studio** | Visuele editor (rol, context, doel, systeem- en gebruikersprompt, variabelen, uitvoerformaat incl. JSON-schema), versiebeheer, tot 4 varianten naast elkaar testen, JSON-validatie, beoordelen, koppelen aan agents/apps. |
| 3 | **AI App Builder** | 8 app-typen (chatbot, klantenservice, e-mailassistent, documentanalyse, offertegenerator, data-assistent, interne assistent, eigen app) met invoervelden, databronnen, prompts, tools en uitvoeropties; testen, publiceren en rolgebaseerde toegang. |
| 4 | **Tools & Integraties** | Tool Manager met input-/outputschema, risiconiveau, minimale rol, time-out en goedkeuringsregels. Ingebouwd: kennisbank, documenten, interne bedrijfsgegevens (CRM e.d.), e-mailconcepten, rekenmachine, datum/tijd, REST-API's (domein-allowlist + SSRF-bescherming), SQL (alleen lezen), webzoeken (Exa), Gmail/Agenda/Drive (OAuth), Shopify, WhatsApp Business en MCP-servers. |
| 5 | **RAG-kennisbank** | Upload van PDF, DOCX, TXT, MD, CSV, JSON en HTML; inhoudscontrole; chunking met paginanummers; embeddings (pgvector, HNSW) + Nederlandse full-text search, samengevoegd via Reciprocal Rank Fusion; bronverwijzingen; toegangsrechten per kennisbank én per document; expliciete melding als informatie ontbreekt. |
| 6 | **AI Agent Builder** | Agents met functie, verantwoordelijkheden, doelen, model, instructies, gekoppelde prompt, tools, eigen kennisbank, datacollecties, deelregels en documentclearance. Gecontroleerde cyclus *doel begrijpen → plan → tool kiezen → uitvoeren → controleren → volgende stap* met limieten op stappen, tijd en kosten; elke stap gelogd. |
| 7 | **Multi-Agent Orchestrator** | Analyseert een opdracht, maakt een gestructureerd takenprotocol (taak-ID's, status, invoer/uitvoer, afhankelijkheden), kiest agents, deelt resultaten alleen volgens toegangsrechten, vangt fouten op, toont live voortgang en stelt een eindrapport samen. |
| 8 | **Engineering Dashboard + workflows** | Actieve modellen, tools, apps, agents, lopende taken, agentactiviteit, kennisbanken, API-verbruik, kosten, fouten en goedkeuringen (live). Visuele workfloweditor (React Flow) met nodes voor start, agent, LLM, tool, controle (ja/nee-tak), goedkeuring en uitvoer. |
| + | **AI Chat, Schrijfstudio, AI Code** | Zie de hoofd-README: slash-opdrachten, schrijfstijlen, documenten met versies en goedkeuring, projecten met Docker-sandbox, Git en AI-codetaken. |
| + | **3D AI-kantoor** | Isometrisch kantoor (React Three Fiber) met geanimeerde robots, werkplekken en dataverbindingen; kleuren en animaties volgen de echte agentstatus (bezig, wacht op goedkeuring, fout). Klik op een agent voor taken, resultaten, tools en activiteit. |

**Clean Schoonmaakbedrijf B.V.** — het sjabloonpakket installeert 16 AI-medewerkers (Directie Assistent, CRM, Sales, Offerte, Planning, Urenregistratie, Kwaliteit, HR, Finance, Social Media, Klantenservice, SEO, Tender, Route, Materialen, IT) met eigen tools, datacollecties en deelregels (bijv. HR deelt alleen met Directie en Planning), plus de workflow **Nieuwe aanvraag → CRM Agent → Offerte Agent → Controle → Goedkeuring → E-mailconcept**. Andere bedrijven (zoals **NobleNest**) krijgen een volledig gescheiden workspace.

---

## Snel starten (lokaal)

Vereisten: Node.js 22+, PostgreSQL 15/16 met de extensie **pgvector**.

```bash
cd ai-workstudio-pro
npm install                   # installeert alle workspaces (apps/* en packages/*)
cp .env.example .env          # vul DATABASE_URL en APP_ENCRYPTION_KEY in
npm run db:migrate            # tabellen, functies en RLS-policies
npm run dev                   # web (http://localhost:3000) + job-worker
```

Open http://localhost:3000 → **Installatie** maakt het eerste beheerdersaccount en je eerste workspace aan.

Optioneel, voor de Clean-, NobleNest- en demo-workspaces:

```bash
SEED_ADMIN_EMAIL=… SEED_ADMIN_PASSWORD=… npm run db:seed
```

PostgreSQL + pgvector snel via Docker:

```bash
docker run -d --name ai-studio-db -p 5432:5432 -e POSTGRES_USER=studio -e POSTGRES_PASSWORD=studio -e POSTGRES_DB=ai_studio pgvector/pgvector:pg16
```

**Supabase**: maak een project, zet `DATABASE_URL` op de connection string (bij de transaction pooler ook `DATABASE_PREPARE=false`) en draai `npm run db:migrate`. pgvector is op Supabase standaard beschikbaar.

### Eerste gebruikersroute

1. **Inloggen** (of installatie).
2. **AI-model configureren**: Instellingen → AI-providers → Anthropic- of OpenAI-sleutel. De sleutel wordt bij de provider geverifieerd, versleuteld opgeslagen en de beschikbare modellen worden via de echte modellen-API opgehaald.
3. **Prompt aanmaken** in Prompt Studio.
4. **Chatten** in LLM Studio (kies model en prompt).
5. **Een tool uitvoeren** (vink bijv. *Rekenmachine* of *Bedrijfsgegeven aanmaken* aan).
6. **Resultaat opslaan** met *Resultaat opslaan* onder een antwoord (te zien bij Tools → Bedrijfsgegevens).

Zonder sleutels kun je alles doorlopen met de **demo-simulator** (`ENABLE_DEMO_PROVIDER=true`). Elk demo-antwoord is gemarkeerd als *DEMO – geen echte AI*; zet hem in productie uit.

---

## Scripts

| Script | Doel |
|--------|------|
| `npm run dev` | Next.js dev-server + job-worker |
| `npm run build` / `npm start` | Productiebuild / starten |
| `npm run worker` | Job-worker (in productie als apart proces draaien) |
| `npm run db:migrate` | Migraties toepassen (`-- --reset` = leegmaken, alleen dev) |
| `npm run db:seed` | Clean-, NobleNest- en demo-workspaces |
| `npm run typecheck` / `npm run lint` | TypeScript / ESLint |
| `npm test` | Unit- en integratietests (Vitest, testdatabase `ai_studio_test`) |
| `npm run test:e2e` | Playwright-test van de eerste gebruikersroute (eerst `npm run build`; database `ai_studio_e2e`) |

Testdatabases: `TEST_DATABASE_URL` en `E2E_DATABASE_URL` (standaard `postgres://studio:studio@localhost:5432/ai_studio_test` en `…/ai_studio_e2e`). Ze worden bij elke run leeggemaakt.

---

## Architectuur

```
src/
  app/                      Pagina's (App Router) en API-routes (/api/w/[org]/…)
  components/               UI (shell, chat, prompts, tools, kennisbank, agents, workflows, kantoor)
  lib/
    ai/                     Provider-adapters (anthropic, openai, demo), modelcatalogus, centrale runChat met kosten
    auth/                   Sessies, scrypt-wachtwoorden, rollen & rechten, uitnodigingen
    db/                     Pool + withTenant (RLS-context) / withSystem
    security/               AES-256-GCM, rate limiting, SSRF, prompt-injectie, JSON-schema, audit
    tools/                  Definities, handlers, executor (rechten → schema → goedkeuring → uitvoering), MCP
    rag/                    Extractie, chunking, ingest, hybride zoeken
    chat/ agents/ orchestrator/ workflows/ apps/ prompts/ approvals/ jobs/ templates/
db/migrations/              SQL-migraties (tabellen, RLS, rechtenmatrix)
scripts/                    migrate, seed, worker
tests/                      unit, integration (echte PostgreSQL), e2e (Playwright)
```

- **Provider-adapters**: één interface (`LLMProvider`) met streaming, tool-calls, JSON-schema-uitvoer, modellenlijst en embeddings. Nieuwe providers = nieuw bestand in `lib/ai/providers`.
- **Tool registry**: tools staan per workspace in de database (schema's, risico, rol, goedkeuring); implementaties in `lib/tools/handlers.ts`; MCP-tools worden dynamisch geregistreerd.
- **Job queue**: PostgreSQL-tabel met `FOR UPDATE SKIP LOCKED`, leases, retries met exponentiële backoff en *dead letter*. Agentruns, orchestraties, workflows en grote documenten draaien in de worker; agentruns zijn hervatbaar na goedkeuring.
- **Modellen**: Claude-modellen volgens de Anthropic-documentatie (o.a. `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`). OpenAI-modellen worden alleen aangeboden nadat ze via `GET /v1/models` bij OpenAI zijn gevonden — zo kan het platform geen niet-bestaande modelnamen gebruiken. Prijzen zijn per model aan te passen (Instellingen → Modellen); onbekende prijzen worden als "onbekend" geregistreerd in plaats van geschat.

## Beveiliging

- **Organisatiescheiding met Row Level Security**: elke tenantquery draait als rol `studio_app` met `app.org_id`/`app.user_id`; policies op alle tabellen (getest). Gesprekken zijn privé per gebruiker; documenten hebben een minimale rol; wachtwoordhashes en sessies zijn onleesbaar voor de applicatierol; het auditlog is append-only.
- **Authenticatie**: scrypt-wachtwoorden, sessietokens alleen gehasht opgeslagen, HttpOnly/SameSite-cookies (`__Host-` bij https), accountvergrendeling na 10 mislukte pogingen, uitnodigingen met eenmalige tokens.
- **Rollen**: eigenaar, beheerder, ontwikkelaar, medewerker, kijker; rechtenmatrix in de database (`role_permissions`), gebruikt door zowel API als RLS.
- **Geheimen**: API-sleutels en integratietokens AES-256-GCM-versleuteld, gebonden aan de organisatie (AAD); de browser ziet alleen een hint.
- **CSRF** (Origin-controle + SameSite), **rate limiting** (PostgreSQL), **security headers** (CSP frame-ancestors, HSTS, nosniff, …).
- **Goedkeuring vooraf** voor gevoelige acties (e-mail/WhatsApp versturen, verwijderen, agenda-afspraken, wijzigende API-verzoeken, MCP-tools).
- **Prompt-injectie**: externe inhoud wordt als data gemarkeerd, verdachte patronen worden gedetecteerd en gelogd, en rechten worden altijd server-side afgedwongen.
- **AVG**: bewaartermijn per workspace (7–3650 dagen); de worker verwijdert elk uur verlopen gesprekken, tooluitvoeringen, runs en sessies.

## Nog in te stellen / bekende beperkingen

- **AI-sleutels** voor Anthropic en/of OpenAI (per workspace in Instellingen). In deze ontwikkelomgeving kon het echte API-verkeer niet worden getest (geen sleutels, uitgaand netwerk beperkt); de adapters zijn getest met gesimuleerde SDK-streams.
- **OpenAI-prijzen** in de catalogus zijn indicatief; controleer ze na synchronisatie in Instellingen → Modellen.
- **Google OAuth** vereist `GOOGLE_CLIENT_ID/SECRET` en de redirect-URI; Shopify, WhatsApp, Exa, SQL en MCP worden in de Tool Manager gekoppeld.
- **Embeddings** vereisen een embeddingmodel (OpenAI `text-embedding-3-small`, na synchronisatie). Zonder embeddings werkt zoeken via full-text search.
- **Authenticatie** is ingebouwd (werkt op elke PostgreSQL, ook Supabase). Supabase Auth/SSO kan later als extra adapter worden toegevoegd.
- SSRF-controle gebeurt op DNS-niveau vóór het verzoek; voor maximale zekerheid tegen DNS-rebinding kan een egress-proxy worden toegevoegd.
