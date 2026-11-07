# Gebruikershandleiding Noblenest

## Het principe

Noblenest haalt productgegevens van leveranciers binnen, controleert ze, berekent je verkoopprijs en zet de producten **als concept** in Shopify. Jij beslist daarna wat je publiceert. Er gaat nooit iets live zonder jouw handeling.

## Menu

| Pagina | Wat je er doet |
|---|---|
| **Dashboard** | Overzicht: geïmporteerd, concepten, actief, zonder afbeelding, mislukte imports, recente imports |
| **Producten zoeken** | Catalogus van een gekoppelde feed doorzoeken, filteren, vergelijken en selecteren |
| **Importeren** | CSV, XML- of JSON-bestand uploaden, voorbeeld controleren, importeren, importgeschiedenis |
| **Bulkimport** | *(fase 6)* grote catalogi via een achtergrondwachtrij |
| **Mijn producten** | Alle geïmporteerde producten met leverancier, inkoop- en verkoopprijs; overzicht van mogelijke duplicaten |
| **AI Studio** | *(fase 5)* Nederlandse titels, beschrijvingen en SEO |
| **Prijsregels** | Bepalen hoe verkoopprijzen worden berekend, met rekenvoorbeeld |
| **Leveranciers** | Feedbronnen koppelen en controleren; welke koppelingen beschikbaar zijn |
| **Synchronisatie** | *(fase 6)* voorraad en prijzen bijwerken |
| **Instellingen** | AI-sleutels, importvoorkeuren, wisselkoersen, veiligheid |
| **Logboeken** | Elke belangrijke actie, waarschuwing en fout |

## 1. Prijsregel instellen

Ga naar **Prijsregels → Prijsregel toevoegen**.

- **Geldt voor**: alle producten, één categorie (producttype uit de CSV) of één leverancier.
- **Prijsstrategie**
  - *Percentage opslag*: kostprijs × (1 + opslag%). 100% = verdubbelen.
  - *Vast opslagbedrag*: kostprijs + bedrag.
  - *Doelmarge*: de prijs waarbij je na betaal- en platformkosten precies de gewenste marge overhoudt.
- **Kosten**: standaard verzendkosten (als de leverancier niets opgeeft), invoerkosten (%), betaalkosten (% + vast), platformkosten, overige kosten (bijv. verpakking).
- **Minimumprijs** en **afronding** (altijd naar boven, op ,95 of ,99).
- **Btw**: stel per regel het juiste tarief in (bijv. 21% of 9%). Kies of prijzen in Shopify inclusief btw zijn (standaard voor consumentenwinkels).
- **Prioriteit**: bij meerdere passende regels wint de laagste prioriteit; bij gelijke prioriteit de meest specifieke (leverancier → categorie → alle).

Gebruik het **rekenvoorbeeld** rechts om een regel te controleren voordat je importeert.

## 2. Importeren via CSV

1. **Importeren** → sleep je CSV-bestand in het vak (max. 5 MB). Zie [CSV-FORMAAT.md](CSV-FORMAAT.md).
2. Je ziet het **voorbeeld**:
   - inkoopprijs, kostprijs, verkoopprijs (per variantbereik) en marge;
   - voorraadstatus (*Op voorraad*, *Niet op voorraad*, *Voorraad onbekend*);
   - **Controles per product**: *Blokkeert* (niet importeerbaar), *Controleren* (wel als concept, maar nakijken vóór publicatie), *Info*.
   - Regels die niet konden worden ingelezen staan bovenaan met regelnummer en reden.
3. **Selecteer** de producten (standaard: alle importeerbare). Geblokkeerde producten en duplicaten kun je niet selecteren.
4. **Beeldrechten**: heeft de leverancier de rechten niet bevestigd (`image_rights` leeg), dan worden die afbeeldingen alleen geïmporteerd als jij het vakje *Ik bevestig dat ik het recht heb…* aanvinkt.
5. Klik **… product(en) als concept importeren**. Dit is je akkoord.
6. Bij meer dan 25 producten verschijnt **Doorgaan** voor de volgende reeks. Mislukte producten kun je **opnieuw proberen** (max. 3 pogingen); een import die nog loopt kun je **annuleren**.

## 2a. Product importeren via URL

Plak een link in **Product importeren via URL** (bovenaan Importeren):
- staat het product in een van je **gekoppelde feeds**, dan krijg je direct een voorbeeld van dat product;
- is het een **directe feed-URL** (.xml of .json), dan wordt de feed eenmalig veilig ingelezen;
- bij **AliExpress, Alibaba of Temu** legt Noblenest uit welke officiële koppeling nodig is;
- bij andere webpagina's haalt Noblenest niets op (geen scraping) en krijg je de alternatieven te zien.

## 2b. Handmatig invoeren

**Importeren → Product handmatig invoeren**: titel, inkoopprijs (verplicht), levertijd, voorraad, foto's, veiligheidsinformatie en eventueel één optie met varianten (bv. Kleur: Zwart, Goud). Met een SKU herkent Noblenest het als je hetzelfde product nog eens invoert.

## 2c. Producten bewerken vóór import

Klik in het importvoorbeeld op **Bewerken** bij een product:
- **Teksten**: titel, beschrijving, producttype, merk, tags, SEO-titel (max. 70) en metabeschrijving (max. 320).
- **Prijzen**: vul een *eigen verkoopprijs* in per variant. Noblenest rekent kostprijs, btw, winst en marge door en waarschuwt bij verlies. Leeg laten = automatische prijs.
- **Afbeeldingen**: kies welke foto's je gebruikt, verander de volgorde en kies de hoofdfoto. Te kleine foto's (< 800 px) en mogelijke dubbele foto's worden gemarkeerd.
- **Foto per variant** en **collecties** (handmatige collecties uit je winkel).

De oorspronkelijke gegevens van de leverancier blijven altijd apart bewaard; in het voorbeeld zie je het label **Bewerkt**.

## 2d. Leveranciersfeeds koppelen en doorzoeken

1. **Leveranciers → Feedbron toevoegen**: naam, formaat (XML/Google of JSON), feed-URL (https), optioneel bronlabel, en of de leverancier gebruik van afbeeldingen toestaat. Noblenest slaat de URL versleuteld op en controleert direct of de feed werkt.
2. **Controleren** toont of de feed bereikbaar is en hoeveel producten erin staan; fouten staan bij de bron en in het logboek.
3. **Doorzoeken** (of menu *Producten zoeken*): filter op tekst, maximale inkoopprijs en voorraad. Selecteer twee of meer producten om ze te **vergelijken** (inkoop, verzending, levertijd, voorraad, varianten, foto's, aandachtspunten).
4. **… naar importvoorbeeld** zet je selectie door. Daarna werkt alles zoals bij een CSV-import: prijzen en controles bekijken, akkoord geven, als concept importeren.
5. **Alles naar voorbeeld** neemt de hele feed in één voorbeeld (al geïmporteerde producten worden als duplicaat overgeslagen).

Zie [FEED-FORMATEN.md](FEED-FORMATEN.md) voor de ondersteunde velden.

## 3. Na de import

- Open een product via **Openen in Shopify** en controleer tekst, foto's en prijs.
- Werk de punten onder *Controleren* af (bijv. veiligheidsinformatie, EU-verantwoordelijke, levertijd).
- Publiceer het product zelf in Shopify wanneer alles klopt.

## 4. Instellingen

- **AI-providers**: sla je API-sleutel van Claude of OpenAI op (wordt versleuteld) en klik *Verbinding testen*. De AI-functies zelf komen in fase 5.
- **Importvoorkeuren**: standaard leverancier/merk en extra tags voor elke import.
- **Wisselkoersen**: ECB-referentiekoersen, dagelijks; handmatige koersen (bijv. `USD=1,08`) gaan voor.

## 5. Veelgestelde vragen

**Kan Noblenest per ongeluk mijn bestaande producten wijzigen?**
Nee. Noblenest maakt alleen nieuwe producten aan en overschrijft nooit bestaande producten.

**Wat als de verbinding wegvalt tijdens een import?**
Het product wordt als mislukt gemarkeerd met "uitkomst onbekend". Bij *Opnieuw proberen* controleert Noblenest eerst in Shopify of het product al bestaat en koppelt het dan, zonder dubbel product.

**Waarom kan ik AliExpress/Temu nog niet koppelen?**
Noblenest gebruikt alleen officiële, toegestane koppelingen. AliExpress vereist een goedgekeurd Open Platform-account (App Key en App Secret). Zie de pagina *Leveranciers* voor de status per leverancier. Een CSV-export of productfeed van je leverancier werkt altijd.
