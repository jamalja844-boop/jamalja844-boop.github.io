# E-mail Finder

Web-app die de publiek vermelde contact-e-mails van bedrijfswebsites opzoekt.
Je plakt websites (of uploadt een CSV met een kolom `Website`), de app leest per site de
homepage en maximaal 3 contactpagina's, en je exporteert het resultaat als CSV.

> Dit is een backend-app. Hij draait niet op GitHub Pages; start hem lokaal of op een eigen server.

## Starten

```bash
cd email-finder
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python app.py            # open http://localhost:8090
```

## Hoe het werkt

- Leest alleen de websites die je zelf opgeeft (geen crawler die het web afstruint).
- Respecteert `robots.txt` en pauzeert tussen pagina's.
- Weigert interne/privé-adressen (bescherming tegen misbruik van de server).
- Ontcijfert geen bewust verborgen adressen; alleen wat een bedrijf open publiceert.

## Regels voor gebruik

Voor zakelijke e-mail in Nederland gelden de AVG en de Telecommunicatiewet (art. 11.7).
Mail relevant en persoonlijk, vermeld wie je bent en bied altijd een afmeldmogelijkheid.
