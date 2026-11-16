# Clean Leadzoeker

Vier hulpmiddelen voor zakelijke e-mailadressen in één programma dat op je eigen computer draait.

| Onderdeel | Wat het doet |
|---|---|
| Websites | Zoekt bedrijven op zoekwoord en plaats, en haalt de gepubliceerde e-mailadressen van hun websites. |
| Persoon | Zoekt het adres van één contactpersoon op naam en website. |
| Controleren | Kijkt per adres of de schrijfwijze klopt, het domein e-mail ontvangt en het postvak bestaat. |
| Mijn leads | Je eigen leadbestand, met status per lead en export naar CSV. |

## Starten

Vereist Node.js 20.3 of nieuwer. Er zijn geen pakketten om te installeren.

```bash
cd leadzoeker
npm start
```

Open daarna http://localhost:4173 in je browser.

## Hoe het werkt

- **Zoeken op zoekwoord:** vul een zoekwoord (tandarts, kantoor, hotel) en een plaats in. De tool zoekt bedrijven in OpenStreetMap, de open kaart waar bedrijven en vrijwilligers gegevens op zetten, en zet hun websites in de lijst. Bedrijven zonder website op de kaart komen niet in de lijst; de dekking verschilt per plaats en branche.
- **Websites:** leest de startpagina en de contactpagina's. Herkent gewone adressen, `mailto:`-links, verhulde schrijfwijzen zoals `info [at] bedrijf [punt] nl` en door Cloudflare afgeschermde adressen. Volgt robots.txt en doorzoekt hooguit 10 pagina's per website.
- **Persoon:** probeert de gangbare schrijfwijzen (jan.devries@, j.devries@, jan@ enzovoort, ook met tussenvoegsels) en vraagt de mailserver welke bestaat. Geeft de mailserver geen uitsluitsel, dan volgt de tool de schrijfwijze van andere adressen op de website.
- **Controleren:** stelt de mailserver de vraag of een postvak bestaat, zonder een bericht te versturen. Servers die elk adres accepteren krijgen het oordeel "Accepteert alles", omdat een bevestiging dan niets zegt.
- **Mijn leads:** staat in `data/leads.json`. Dat bestand zit niet in Git; maak er zelf af en toe een kopie van.

## Goed om te weten

- De postvakcontrole gebruikt poort 25. Sommige internetaanbieders blokkeren die; adressen krijgen dan het oordeel "Onbekend".
- Controleer niet duizenden adressen achter elkaar vanaf je eigen verbinding. Mailservers kunnen je IP-adres dan tijdelijk weigeren. De tool beperkt elke opdracht tot 200 adressen.
- De controle meldt zich bij mailservers als `cleanschoonmaakbedrijf.nl`. Bij websites en de kaartdienst meldt de tool zich als "CleanLeadzoeker" met een verwijzing naar www.cleanschoonmaakbedrijf.nl.
- De tool luistert alleen op je eigen computer. Alleen je zoekwoord en plaats gaan naar de kaartdienst van OpenStreetMap; verder wordt niets naar derden gestuurd.

## Testen

```bash
npm test
```

## Gebruik binnen de regels

Voor commerciële e-mail is in Nederland vooraf toestemming nodig (Telecommunicatiewet, artikel 11.7), tenzij het bedrijf het adres zelf voor dat doel heeft gepubliceerd. Vermeld in elk bericht wie je bent en bied een afmeldmogelijkheid. Adressen op naam van een persoon zijn persoonsgegevens: bewaar ze alleen zolang je ze nodig hebt en verwijder ze als iemand daarom vraagt.
