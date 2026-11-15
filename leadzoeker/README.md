# Clean Leadzoeker

Zoekt de gepubliceerde zakelijke e-mailadressen op een lijst bedrijfswebsites en zet ze in een overzicht dat je als CSV kunt downloaden.

## Starten

Vereist Node.js 20.3 of nieuwer. Er zijn geen pakketten om te installeren.

```bash
cd leadzoeker
npm start
```

Open daarna http://localhost:4173 in je browser.

## Wat het doet

- Leest per website de startpagina en de meest kansrijke contactpagina's (contact, over ons, team, colofon).
- Herkent gewone adressen, `mailto:`-links, verhulde schrijfwijzen zoals `info [at] bedrijf [punt] nl` en door Cloudflare afgeschermde adressen.
- Toont standaard alleen algemene bedrijfsadressen (info@, administratie@). Adressen op naam van een persoon zijn persoonsgegevens en staan standaard uit.
- Controleert of het domein een mailserver heeft.
- Volgt robots.txt, wacht tussen pagina's en doorzoekt hooguit 10 pagina's per website.
- Draait alleen op je eigen computer; er worden geen gegevens naar derden gestuurd.

## Testen

```bash
npm test
```

## Gebruik binnen de regels

Voor commerciële e-mail is in Nederland vooraf toestemming nodig (Telecommunicatiewet, artikel 11.7), tenzij het bedrijf het adres zelf voor dat doel heeft gepubliceerd. Vermeld in elk bericht wie je bent en bied een afmeldmogelijkheid.
