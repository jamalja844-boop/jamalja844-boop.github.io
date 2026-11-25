---
name: shopify-ops
description: "Werkwijze voor Shopify-webshopbeheer (NobleNest): producten, collecties, voorraad, prijzen, kortingen, productteksten en analyses via de Shopify-connector, met verplichte toestemming voor elke wijziging aan de live winkel. Gebruik voor alles rond de webshop."
---
# Shopify-beheer

1. **Context:** `get-shop-info` (controleer winkel, valuta, abonnement).
2. **Lezen:** zoek eerst het schema (`graphql_schema`) en/of laad een passende Shopify-skill (`use_skill`); daarna `graphql_query`. Gebruik paginering (`first: 50`). Nooit ID's raden: zoek ze op.
3. **Analyses:** `run-analytics-query` (ShopifyQL) voor omzet, bestellingen, toppers; vermeld periode.
4. **Wijzigen (live winkel!):**
   - Maak een voor/na-tabel: `| Product | Veld | Nu | Nieuw |`.
   - Schrijf de exacte GraphQL-mutatie uit.
   - Laat `approval-gate` een verzoek maken; voer pas uit na akkoord (HITL-hook vraagt bevestiging).
   - Controleer na uitvoering met een `graphql_query` dat de wijziging klopt.
5. **Productteksten:** titel (<= 70 tekens), beschrijving met voordelen + specificaties (alleen echte), SEO-titel/-beschrijving (samen met `seo`).
6. Abonnement **Basic**: sommige functies (bijv. geavanceerde rapporten) zijn niet beschikbaar; controleer vóór je ze voorstelt.
