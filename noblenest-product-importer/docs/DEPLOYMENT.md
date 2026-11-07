# Deployment (productie)

## Benodigd

- Een server of platform dat Docker-containers draait (bijv. Fly.io, Render, Railway, Google Cloud Run, een VPS).
- Beheerde **PostgreSQL 16** (met dagelijkse back-ups).
- **Redis** (vanaf fase 6, voor achtergrondtaken).
- Een HTTPS-domein, bijv. `https://noblenest.jouwdomein.nl`.

## Omgevingsvariabelen

| Variabele | Waarde |
|---|---|
| `NODE_ENV` | `production` |
| `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` | Uit het Dev Dashboard (Client ID / Client secret) — als geheim instellen |
| `SHOPIFY_APP_URL` | Publieke URL van de app |
| `SCOPES` | `write_products` |
| `DATABASE_URL` | PostgreSQL-verbinding (met `sslmode=require` bij beheerde databases) |
| `REDIS_URL` | Redis-verbinding (fase 6) |
| `NOBLENEST_ENCRYPTION_KEY` | 32 bytes base64 — als geheim instellen, apart back-uppen |
| `NOBLENEST_MAX_UPLOAD_MB` / `NOBLENEST_MAX_ROWS` | Optioneel (standaard 5 / 5000) |

## Bouwen en starten

```bash
docker build -t noblenest .
docker run -p 3000:3000 --env-file .env.production noblenest
```

De container voert bij het starten `prisma migrate deploy` uit en start daarna de server op poort 3000. Hij draait als niet-root gebruiker.

## Shopify-configuratie bijwerken

1. Zet in `shopify.app.toml` `application_url` en `redirect_urls` op je productie-URL (of gebruik `shopify app config link` voor een aparte productieconfiguratie).
2. Rol uit: `npm run deploy`.
3. Installeer de app in je winkel via de link uit **Custom distribution** in het Dev Dashboard.

## Checklist vóór livegang

- [ ] `NOBLENEST_ENCRYPTION_KEY` ingesteld én veilig bewaard
- [ ] Databaseback-ups actief
- [ ] `npm test`, `npm run typecheck` en `npm run lint` slagen
- [ ] Eerst getest in een ontwikkelwinkel met de voorbeeldcatalogus
- [ ] Minstens één prijsregel per btw-tarief dat je gebruikt
- [ ] Logboek gecontroleerd na de eerste echte import

## Updates

```bash
git pull
npm ci
npm run build
npx prisma migrate deploy   # gebeurt ook automatisch bij het starten van de container
```
