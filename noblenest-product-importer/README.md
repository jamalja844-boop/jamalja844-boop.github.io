# Noblenest

**Productimportapp voor Shopify** — leveranciersproducten veilig importeren als concept, met exacte prijsberekening, kwaliteits- en regelgevingscontrole, duplicaatpreventie en (vanaf fase 5) Nederlandse AI-teksten.

| | |
|---|---|
| Appnaam | Noblenest |
| Technische slug | `noblenest-product-importer` |
| Type | Embedded Shopify-app (eigen app voor één winkel) |
| Taal | Nederlands |
| Stack | TypeScript · React Router 7 · Polaris web components · App Bridge · Shopify Admin GraphQL API 2026-10 · PostgreSQL · Prisma · Zod · Vitest |

## Wat werkt nu (fase 1 + 2)

- **Shopify-koppeling** via de officiële authenticatie (session tokens / token exchange), sessies in PostgreSQL.
- **Dashboard** met geïmporteerde producten, concepten, producten zonder afbeelding, mislukte imports en recente imports.
- **CSV-import** met voorbeeld: varianten (max. 3 opties), inkoopprijzen, valuta, voorraad, verzendkosten, levertijd, afbeeldingen, veiligheidsinformatie. Nederlandse én Engelse kolomnamen, komma/puntkomma/tab, UTF-8 en Excel (Windows-1252).
- **Prijsregels** (vast bedrag, percentage, doelmarge; per categorie/leverancier; minimumprijs; afronding op ,95/,99; btw instelbaar per regel; betaal-, platform-, invoer- en overige kosten) met live rekenvoorbeeld. ECB-wisselkoersen met handmatige overschrijving.
- **Kwaliteitscontrole** per product: ontbrekende inkoopprijs (blokkeert), foto's, beeldrechten, beschrijving, levertijd, EAN/GTIN, veiligheidsinformatie en EU-verantwoordelijke (GPSR).
- **Conceptimport naar Shopify** met `productSet` — altijd `DRAFT`, nooit publiceren, nooit bestaande producten overschrijven. Afbeeldingen alleen met bevestigde beeldrechten.
- **Duplicaatpreventie** op drie niveaus: databasekoppeling, uniek app-metafield `$app.source_id` (type `id`) en `productByIdentifier`-controle vóór elke aanmaak.
- **Betrouwbare verwerking**: atomair claimen per product (geen dubbele verwerking), batches van 25, pauzeren/doorgaan, annuleren, opnieuw proberen (max. 3 pogingen), herstel na netwerkfouten.
- **Mijn producten**, **Leveranciers** (eerlijke integratiestatus), **Instellingen** (AI-sleutels versleuteld met AES-256-GCM, importvoorkeuren, wisselkoersen), **Logboeken**.
- **Beveiliging**: HMAC-gevalideerde webhooks incl. AVG-compliancewebhooks, autorisatie per winkel, Zod-validatie, uploadcontrole, SSRF-bescherming, HTML-sanering, minimale scope (`write_products`).

Modules die nog gebouwd worden (Producten zoeken, Bulkimport, AI Studio, Synchronisatie) tonen een eerlijke statuspagina zonder niet-werkende knoppen. Zie [docs/ROADMAP.md](docs/ROADMAP.md).

## Snel starten

```bash
cd noblenest-product-importer
npm install
cp .env.example .env            # vul NOBLENEST_ENCRYPTION_KEY in
docker compose up -d             # PostgreSQL + Redis
npx prisma migrate deploy
npm test                         # unit- en integratietests
npm run dev                      # start via Shopify CLI (vraagt om in te loggen)
```

Volledige stappen: [docs/INSTALLATIE.md](docs/INSTALLATIE.md).

## Documentatie

| Document | Inhoud |
|---|---|
| [INSTALLATIE.md](docs/INSTALLATIE.md) | Installatie, Shopify Dev Dashboard, ontwikkelwinkel |
| [GEBRUIKERSHANDLEIDING.md](docs/GEBRUIKERSHANDLEIDING.md) | Werken met Noblenest, stap voor stap |
| [CSV-FORMAAT.md](docs/CSV-FORMAAT.md) | Alle kolommen en voorbeelden |
| [ARCHITECTUUR.md](docs/ARCHITECTUUR.md) | Opbouw, datamodel, importflow, beveiliging |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Productie (Docker, hosting, migraties) |
| [BEPERKINGEN.md](docs/BEPERKINGEN.md) | Bekende beperkingen |
| [KOSTEN.md](docs/KOSTEN.md) | Overzicht van externe kosten |
| [ROADMAP.md](docs/ROADMAP.md) | Fasen en status |

## Scripts

| Script | Doel |
|---|---|
| `npm run dev` | Ontwikkelen via Shopify CLI (tunnel + ontwikkelwinkel) |
| `npm run build` / `npm start` | Productie-build en server |
| `npm test` | Alle tests (unit + integratie tegen `noblenest_test`) |
| `npm run typecheck` / `npm run lint` | TypeScript en ESLint |
| `npm run deploy` | App-configuratie (scopes, webhooks, metafield) uitrollen naar Shopify |

Gebouwd op het officiële [Shopify React Router-appsjabloon](https://github.com/Shopify/shopify-app-template-react-router) (MIT, zie `LICENSE-shopify-app-template.md`).
