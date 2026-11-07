# Feedformaten (XML en JSON)

Naast CSV ondersteunt Noblenest productfeeds van leveranciers, als **bestand** (Importeren) of als **feed-URL** (Leveranciers → Feedbron toevoegen). Voorbeelden staan in `public/voorbeeld/` en zijn te downloaden op de pagina Importeren.

Alle formaten gaan door dezelfde validatie, prijsberekening, kwaliteitscontrole en duplicaatcontrole als CSV.

## XML — Google Merchant Center-formaat

Het meest gebruikte feedformaat bij leveranciers en dropshippers: RSS 2.0 (`<rss><channel><item>`) of Atom (`<feed><entry>`) met de namespace `http://base.google.com/ns/1.0` (meestal prefix `g:`; een ander prefix wordt automatisch herkend).

| Feedveld | Wordt in Noblenest | Opmerking |
|---|---|---|
| `g:item_group_id` | product-ID | Items met dezelfde groep worden één product met varianten |
| `g:id` | variant-ID (en product-ID zonder groep) | |
| `g:title`, `g:description` | titel, beschrijving | HTML wordt gefilterd |
| `g:link` | bron-URL | Voor duplicaatcontrole |
| `g:image_link`, `g:additional_image_link` | afbeeldingen | `image_link` per item = variantafbeelding |
| `g:cost_of_goods_sold` | **inkoopprijs** | Heeft voorrang |
| `g:price` | inkoopprijs (als `cost_of_goods_sold` ontbreekt) | In een leveranciersfeed is dit de prijs die jij betaalt — controleer dit bij je leverancier |
| `g:availability` | voorraadstatus | `in_stock`, `out_of_stock`; `preorder`/`backorder` = onbekend |
| `g:brand` | merk | |
| `g:gtin` | EAN/barcode | |
| `g:mpn` | SKU | Anders `g:id` |
| `g:color`, `g:size`, `g:material`, `g:pattern` | opties Kleur, Maat, Materiaal, Patroon | Alleen attributen die binnen een groep verschillen (max. 3) |
| `g:product_type` | producttype | Laatste deel na `>` (ook voor categorieprijsregels) |
| `g:shipping` (`g:price`, `g:min_transit_time`, `g:max_transit_time`) | verzendkosten en transporttijd | Bij meerdere landen wordt NL gebruikt |
| `g:min_handling_time`, `g:max_handling_time` | verwerkingstijd | Levertijd = verwerking + transport |
| `g:shipping_weight` / `g:product_weight` | gewicht | `kg`, `g`, `lb`, `oz` |

Prijzen: `"12.99 EUR"` of `"EUR 12,99"` — de valuta staat in de prijs.

**Beveiliging:** XML met `<!DOCTYPE` of `<!ENTITY` wordt geweigerd (bescherming tegen XXE en entity-expansie).

## JSON — Noblenest-formaat

```json
{
  "products": [
    {
      "external_id": "LAMP-1",
      "title": "Messing wandlamp",
      "description": "Geborsteld messing, E27.",
      "vendor": "Lampenhuis",
      "product_type": "Verlichting",
      "tags": ["Verlichting", "Messing"],
      "source_url": "https://leverancier.nl/lamp-1",
      "currency": "EUR",
      "cost_price": 24.5,
      "shipping_cost": 6.95,
      "delivery_days_min": 2,
      "delivery_days_max": 5,
      "image_urls": ["https://leverancier.nl/img/lamp-1.jpg"],
      "image_rights": true,
      "safety_info": "Alleen voor gebruik binnenshuis.",
      "eu_responsible_person": "Lampenhuis B.V., Straat 1, 1000 AA Amsterdam",
      "country_of_origin": "NL",
      "options": ["Kleur"],
      "variants": [
        { "sku": "LAMP-1-GD", "option_values": ["Goud"], "stock_quantity": 12, "barcode": "8712345000011" },
        { "sku": "LAMP-1-ZW", "option_values": { "Kleur": "Zwart" }, "stock_quantity": 0, "cost_price": 26.0 }
      ]
    }
  ]
}
```

- Een lijst op het hoogste niveau (`[ … ]`) mag ook, net als `"producten"`.
- Veldnamen zijn dezelfde als bij CSV, in het Engels of Nederlands (`titel`, `inkoopprijs`, `voorraad` …).
- `option_values`: lijst in de volgorde van `options`, of object `{ "Kleur": "Zwart" }`.
- Per variant: `variant_id`, `sku`, `barcode`, `cost_price`, `stock_quantity`, `stock_status`, `weight_grams`, `image_url`.

## Bronlabel

Gebruik je meerdere leveranciers met overlappende ID's (bv. allebei `1001`)? Geef dan per leverancier een vast **bronlabel** op (bv. `linnenhuis`). De product-ID wordt dan `linnenhuis:1001`, zodat duplicaatcontrole per leverancier klopt. Gebruik voor dezelfde leverancier altijd hetzelfde label.

## Beeldrechten bij feeds

Feeds bevatten geen beeldrechten. Vink **"Leverancier staat gebruik van feedafbeeldingen toe"** alleen aan als je leverancier dat (schriftelijk) toestaat. Anders worden afbeeldingen pas geïmporteerd nadat je de rechten in het importvoorbeeld bevestigt.

## Feed-URL's

- Alleen `https`, alleen publieke adressen (geen interne netwerken, IP-adressen of localhost); het IP-adres wordt bij elke verbinding gecontroleerd (ook na doorverwijzingen).
- Maximaal 20 MB (instelbaar via `NOBLENEST_MAX_FEED_MB`), time-out 20 seconden, max. 3 doorverwijzingen.
- De URL wordt **versleuteld** opgeslagen; in de app zie je alleen host en pad (tokens in de querystring blijven geheim).
