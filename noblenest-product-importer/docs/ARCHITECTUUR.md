# Architectuur

## Overzicht

```
Shopify-admin (iframe)
  └─ Noblenest (React Router 7, Polaris web components, App Bridge)
       ├─ routes/            UI + loaders/actions (server)
       ├─ services/*.server  orkestratie, database, Shopify-aanroepen
       ├─ lib/               pure domeinlogica (geen database/netwerk) — volledig unit-getest
       │    ├─ import/       CSV-parser, normalisatie, HTML-sanering, kwaliteitscontrole, duplicaten
       │    ├─ pricing/      prijscalculator (decimal.js), ECB-wisselkoersen
       │    ├─ shopify/      productSet-invoer + GraphQL-documenten
       │    └─ security/     AES-256-GCM, uploadcontrole
       └─ PostgreSQL (Prisma)          Redis + BullMQ (fase 6)
```

**Laagregel:** `lib/` kent geen database of netwerk; `services/` gebruikt `lib/` plus Prisma en een *geïnjecteerde* GraphQL-client (`AdminGraphqlClient`), zodat de volledige importflow in integratietests met een nep-Shopify draait.

## Shopify-integratie

| Onderdeel | Keuze |
|---|---|
| Sjabloon | Officieel `shopify-app-template-react-router` |
| API | Admin GraphQL **2026-10** (geen REST) |
| Authenticatie | `@shopify/shopify-app-react-router`, embedded auth (session tokens + token exchange), `AppDistribution.SingleMerchant` |
| Sessies | `@shopify/shopify-app-session-storage-prisma` (PostgreSQL) |
| Scopes | `write_products` (impliceert lezen). Voorraad-/collectierechten pas bij fase 6 |
| Product aanmaken | `productSet(input, synchronous: true)` **zonder identifier** → altijd nieuw, `status: DRAFT` |
| Bron-ID | App-metafield `$app.source_id`, type `id` (automatisch uniek), gedeclareerd in `shopify.app.toml` |
| Bestaat al? | `productByIdentifier(identifier: { customId: … })` vóór elke aanmaak |
| Webhooks | `app/uninstalled`, `app/scopes_update`, compliance (`customers/data_request`, `customers/redact`, `shop/redact`) — HMAC via `authenticate.webhook` |

### Waarom productSet alleen voor nieuwe producten?
`productSet` verwijdert lijst-elementen (varianten, media, metafields) die niet in de invoer staan. Om bestaande gegevens nooit onbedoeld te overschrijven, gebruikt Noblenest `productSet` uitsluitend om nieuwe producten aan te maken. Synchronisatie (fase 6) gebruikt gerichte mutaties zoals `productVariantsBulkUpdate` en voorraadmutaties.

## Importflow

```
CSV → checkCsvUpload → parseProductCsv → NormalizedProduct[]
    → checkProduct (kwaliteit/regelgeving) + detectDuplicates + priceProduct
    → ImportJob (PREVIEW) + ImportJobItem[]            ← winkelier controleert en selecteert
    → startImport (PREVIEW → QUEUED, eenmalig)        ← akkoord
    → processJob (batches van 25)
         per item: atomair claimen (PENDING → IMPORTING, attempts+1)
                   → databasekoppeling bestaat? overslaan
                   → SupplierProduct + varianten + afbeeldingen vastleggen
                   → productByIdentifier: bestaat al in Shopify? koppelen (herstel)
                   → productSet (DRAFT) → koppeling + variant-ID's + logboek
    → COMPLETED / COMPLETED_WITH_ERRORS / FAILED / PAUSED / CANCELLED
```

Garanties (getest in `tests/integration/import-flow.test.ts`):
- geen publicatie (alles `DRAFT`);
- geen duplicaten bij herhaalde upload;
- geen dubbel product na een verloren antwoord van Shopify (herstel via bron-ID);
- fouten per product, de rest gaat door;
- annuleren stopt openstaande items;
- winkels zien elkaars gegevens niet.

## Datamodel (PostgreSQL)

| Model | Doel |
|---|---|
| `Session` | Shopify-sessies (toegangstokens) |
| `Shop` | Geïnstalleerde winkel; alle data hangt hieraan (cascade bij `shop/redact`) |
| `User` | Shopify-gebruiker (uit session token `sub`), voor het logboek |
| `Supplier` | Leveranciersregister met eerlijke integratiestatus en functies |
| `SupplierConnection` | Koppeling per winkel + versleutelde credentials (fase 3) |
| `SupplierProduct` | Bronproduct: **originele** leveranciersgegevens (`title`, `descriptionHtml`, `rawData`) gescheiden van AI-velden (`aiTitle`, `seoTitle`, …) |
| `ProductVariant` | Bronvariant met opties, inkoopprijs, voorraad, `shopifyVariantId` |
| `ProductImage` | Bronafbeelding met `rightsStatus` en `importedToShopify` |
| `ShopifyProductMapping` | Bron ⇄ Shopify (`sourceKey` uniek per winkel, `shopifyProductId` uniek per winkel) |
| `ImportJob` / `ImportJobItem` | Importtaak en items (payload, controles, goedgekeurde prijzen, status, pogingen, fout) |
| `SyncJob` | Synchronisatie-runs (fase 6) |
| `PricingRule` | Prijsregels (strategie, kosten, btw, afronding, prioriteit, scope) |
| `AIJob` | AI-taken met invoer/uitvoer en tokengebruik (fase 5) |
| `AuditLog` | Logboek (geheimen worden automatisch gemaskeerd) |
| `AppSetting` | Instellingen per winkel; geheimen alleen in `valueEncrypted` |

Externe ID's (`externalId`, `sourceKey`) en Shopify-ID's (`shopifyProductId`, `shopifyVariantId`) staan in aparte kolommen. Relevante unieke sleutels en indexen staan in `prisma/schema.prisma`; migraties in `prisma/migrations/`.

## Beveiliging

| Maatregel | Implementatie |
|---|---|
| Authenticatie & sessies | `authenticate.admin` op elke route; bot-verzoeken geweigerd |
| Autorisatie per winkel | Elke query filtert op `shopId`; getest |
| Webhooks | HMAC-validatie (`authenticate.webhook`) |
| Geheimen | AES-256-GCM, unieke IV, AAD = winkel + sleutelnaam, sleutel alleen in env |
| Invoervalidatie | Zod op alle formulieren en payloads |
| Uploads | Extensie, MIME, grootte (vóór inlezen via content-length), geen binaire inhoud |
| SSRF | Alleen publieke https-hosts; geen IP's, localhost of interne domeinen |
| XSS | Leveranciers-HTML gefilterd met sanitize-html (allowlist) |
| Logboek | Alle imports, instellingen en fouten; geheimen gemaskeerd |
| AVG | Geen klantgegevens opgeslagen; `shop/redact` verwijdert alle winkeldata |
| Container | Draait als niet-root gebruiker |

Nog te doen (zie ROADMAP): rate limiting per winkel en BullMQ-achtergrondtaken (fase 6/7).
