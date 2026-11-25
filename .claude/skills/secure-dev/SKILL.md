---
name: secure-dev
description: "Beveiligings- en privacychecklist voor ontwikkeling en configuratie: geheimenbeheer, invoervalidatie, injectie, XSS, rechten, afhankelijkheden, AVG/GDPR en veilige integraties. Gebruik bij het schrijven of reviewen van code, API's, databases, automatiseringen en MCP-configuratie."
---
# Veilig ontwikkelen

## Geheimen
- Nooit in code, `.mcp.json`, git, logs of memory. Gebruik omgevingsvariabelen (`${VAR}` in `.mcp.json`) of de credential-manager van de omgeving.
- `.env` staat in `.gitignore` en is geblokkeerd voor agents (`memory_acl.py`). Commit alleen `.env.example` zonder waarden.
- Gelekt? Direct roteren bij de aanbieder, daarna uit git-geschiedenis verwijderen (toestemming nodig).

## Code
- Invoer valideren (type, lengte, whitelist); output escapen (XSS); SQL alleen geparametriseerd; geen `eval`/`shell=True` met gebruikersinvoer.
- Least privilege: tokens met minimale scopes; Supabase: RLS aan; API's: authenticatie + rate limiting.
- Afhankelijkheden: vaste versies, `npm audit` / `pip-audit` waar beschikbaar.
- Foutmeldingen naar gebruikers zonder stacktraces of interne details.

## Deze repository
- Openbare GitHub Pages-site: alles op `main` is openbaar en wordt gepubliceerd. Gevoelige mappen staan in `.gitignore` en `_config.yml` -> `exclude`.

## Privacy (AVG)
Dataminimalisatie · doelbinding · bewaartermijn · verwerkersovereenkomst met externe diensten · rechten van betrokkenen (inzage/verwijdering).
