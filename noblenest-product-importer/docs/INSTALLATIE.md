# Installatiehandleiding Noblenest

Deze handleiding brengt Noblenest van broncode naar een werkende app in een Shopify-ontwikkelwinkel. Reken op 30–45 minuten.

## 1. Benodigdheden

| Onderdeel | Versie | Opmerking |
|---|---|---|
| Node.js | 22.12 of hoger | `node -v` |
| Docker Desktop | recent | voor PostgreSQL en Redis (of eigen PostgreSQL 16) |
| Shopify CLI | nieuwste | `npm install -g @shopify/cli@latest` |
| Shopify-account | — | gratis via [dev.shopify.com/dashboard](https://dev.shopify.com/dashboard) |
| Git | — | |

## 2. Project installeren

```bash
git clone https://github.com/jamalja844-boop/jamalja844-boop.github.io.git
cd jamalja844-boop.github.io/noblenest-product-importer
npm install
```

## 3. Omgevingsvariabelen

```bash
cp .env.example .env
```

Genereer een versleutelingssleutel en zet die in `.env` bij `NOBLENEST_ENCRYPTION_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

> **Bewaar deze sleutel veilig** (bijv. in een wachtwoordkluis). Zonder deze sleutel kunnen opgeslagen API-sleutels niet meer worden ontsleuteld. Zet `.env` nooit in Git (staat al in `.gitignore`).

`SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET` en `SHOPIFY_APP_URL` worden tijdens ontwikkeling automatisch door de Shopify CLI gezet.

## 4. Database starten

```bash
docker compose up -d
npx prisma migrate deploy
```

Dit start PostgreSQL 16 (poort 5432) en Redis 7 (poort 6379, nodig vanaf fase 6) en maakt alle tabellen aan.

Voor de integratietests heb je een aparte testdatabase nodig:

```bash
docker exec -it noblenest-postgres psql -U noblenest -c "CREATE DATABASE noblenest_test;"
npm test
```

## 5. App aanmaken in Shopify

1. Log in op het [Shopify Dev Dashboard](https://dev.shopify.com/dashboard).
2. Maak een **ontwikkelwinkel** aan (gratis, voor testen) — of gebruik `shopify store create dev`.
3. Koppel het project aan een nieuwe app:
   ```bash
   npm run config:link
   ```
   Kies **Create a new app**, naam **Noblenest**. De CLI vult `client_id` en de URL's in `shopify.app.toml` in.
4. Rol de configuratie uit (scopes, webhooks en het metafield `Noblenest bron-ID`):
   ```bash
   npm run deploy
   ```

## 6. Starten

```bash
npm run dev
```

De CLI start een beveiligde tunnel, vraagt je de ontwikkelwinkel te kiezen en toont een link om de app te installeren. Na installatie verschijnt **Noblenest** in de Shopify-admin onder Apps.

## 7. Eerste test (± 5 minuten)

1. **Prijsregels** → *Prijsregel toevoegen*: bijv. "Standaard", percentage opslag 120%, afronding ,95, btw 21%.
2. **Importeren** → download de *voorbeeld-CSV* en upload hem weer.
3. Controleer het voorbeeld: prijzen, varianten, meldingen. Het product zonder inkoopprijs is geblokkeerd.
4. Klik **… product(en) als concept importeren**.
5. Open een product via *Openen in Shopify*: status **Concept**, varianten en prijzen kloppen.
6. Upload dezelfde CSV opnieuw: alle producten worden als **duplicaat** herkend.

## 8. Naar je echte winkel

Voor je eigen (live) winkel gebruik je **custom distribution**: in het Dev Dashboard kies je bij de app *Distribution → Custom distribution* en vul je het domein van je winkel in. Je ontvangt een installatielink. Zie [DEPLOYMENT.md](DEPLOYMENT.md) voor hosting in productie.

> Noblenest wijzigt of publiceert niets in je winkel zonder jouw actie: producten komen altijd als concept binnen.

## Problemen oplossen

| Melding | Oplossing |
|---|---|
| "Versleutelingssleutel ontbreekt" | `NOBLENEST_ENCRYPTION_KEY` instellen en server herstarten |
| "Geen actieve prijsregel" | Eerst een prijsregel aanmaken |
| "Shopify (metafield bron-ID): …" | `npm run deploy` uitvoeren zodat het metafield-definitie bestaat |
| "ECB-koersen niet beschikbaar" | Server heeft geen internettoegang tot ecb.europa.eu; vul handmatige koersen in bij Instellingen |
| Databasefout bij start | `docker compose ps` en `npx prisma migrate deploy` controleren |
