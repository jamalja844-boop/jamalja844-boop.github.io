# CSV-formaat

Voorbeeld: [`public/voorbeeld/noblenest-voorbeeldcatalogus.csv`](../public/voorbeeld/noblenest-voorbeeldcatalogus.csv) (ook te downloaden op de pagina Importeren).

## Basisregels

- **Eén regel per variant.** Regels met dezelfde `external_id` vormen samen één product; productgegevens staan op de eerste regel.
- Scheidingsteken: komma, puntkomma of tab (automatisch herkend).
- Codering: UTF-8 of Windows-1252 (Excel).
- Bedragen: `12,50`, `12.50`, `1.234,56` en `€ 12,50` worden allemaal herkend. Negatieve waarden zijn niet toegestaan.
- Lijsten (afbeeldingen): scheiden met `|`. Tags: scheiden met komma.
- Maximaal 5 MB en 5.000 regels per bestand (instelbaar).

## Kolommen

Kolomnamen mogen in het Engels of Nederlands (tussen haakjes).

| Kolom | Verplicht | Niveau | Beschrijving |
|---|---|---|---|
| `external_id` (`externe_id`) | ✅ | product | Unieke ID bij de leverancier. Basis voor duplicaatcontrole. Max. 200 tekens. |
| `title` (`titel`) | ✅ | product | Producttitel, max. 255 tekens. |
| `description` (`beschrijving`) | | product | Tekst of HTML. HTML wordt gefilterd (geen scripts, iframes, stijlen). |
| `vendor` (`leverancier`) | | product | Leverancier/verkoper. |
| `brand` (`merk`) | | product | Merk (gebruikt als vendor als die ontbreekt). |
| `product_type` (`producttype`, `categorie`) | | product | Producttype; ook gebruikt voor categorieprijsregels. |
| `tags` | | product | Komma-gescheiden. |
| `source_url` (`bron_url`) | | product | Productpagina bij de leverancier (https). Gebruikt voor duplicaatcontrole. |
| `currency` (`valuta`) | | product | ISO-code, bijv. `EUR`, `USD`, `CNY`. Standaard: winkelvaluta. |
| `cost_price` (`inkoopprijs`) | aanbevolen | product/variant | Inkoopprijs. Zonder inkoopprijs is een product niet importeerbaar. |
| `variant_cost_price` | | variant | Afwijkende inkoopprijs per variant. |
| `shipping_cost` (`verzendkosten`) | | product | Verzendkosten van de leverancier (in `currency`). |
| `delivery_days_min` / `delivery_days_max` (`levertijd_min` / `levertijd_max`) | aanbevolen | product | Levertijd in dagen. |
| `stock_quantity` (`voorraad`) | | variant | Aantal op voorraad. |
| `stock_status` (`voorraadstatus`) | | variant | `op voorraad` / `in_stock` of `uitverkocht` / `out_of_stock`. Leeg = voorraad onbekend. |
| `variant_id` | | variant | ID van de variant bij de leverancier (anders: SKU of optiewaarden). |
| `sku` (`artikelnummer`) | | variant | |
| `barcode` (`variant_ean`) | | variant | EAN/GTIN van de variant. |
| `gtin` (`ean`) | | product | EAN/GTIN op productniveau. |
| `option1_name` … `option3_name` (`optie1_naam` …) | bij varianten | product | Bijv. `Maat`, `Kleur`. Max. 3 opties. |
| `option1_value` … `option3_value` (`optie1_waarde` …) | bij varianten | variant | Bijv. `XL`, `Zwart`. |
| `weight_grams` (`gewicht_gram`) | | variant | Gewicht in gram. |
| `image_urls` (`afbeeldingen`) | | product | Afbeeldingen (https), gescheiden door `|`. |
| `variant_image_url` (`variant_afbeelding`) | | variant | Afbeelding van deze variant. |
| `image_alt` | | product | Alt-tekst (standaard: titel). |
| `image_rights` (`beeldrechten`) | | product | `ja` = leverancier geeft toestemming voor gebruik van de afbeeldingen. |
| `safety_info` (`veiligheidsinformatie`) | aanbevolen | product | Waarschuwingen en veiligheidsinformatie (GPSR). |
| `eu_responsible_person` (`eu_verantwoordelijke`) | aanbevolen | product | Fabrikant of EU-verantwoordelijke met adres (GPSR). |
| `country_of_origin` (`land_van_herkomst`) | | product | Landcode van 2 letters, bijv. `CN`, `NL`. |

## Voorbeeld met varianten

```csv
external_id,title,cost_price,currency,option1_name,option1_value,sku,stock_quantity,image_urls,image_rights
LAMP-1,Messing wandlamp,24.50,EUR,Kleur,Goud,LAMP-1-GD,12,https://leverancier.nl/img/lamp-goud.jpg,ja
LAMP-1,,26.00,,,Zwart,LAMP-1-ZW,0,,
```

## Foutmeldingen

Fouten worden per regel getoond, bijvoorbeeld:

- `Regel 4: [B1] inkoopprijs: "tien" is geen geldig getal`
- `Regel 7: [D1] dubbele variant "rood"`
- `Regel 5: [C1] afbeelding: alleen https-adressen zijn toegestaan`

Alleen het product met de fout wordt overgeslagen; de rest van het bestand wordt gewoon ingelezen.
