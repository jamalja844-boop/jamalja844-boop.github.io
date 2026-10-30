# Clean SEO & Ads AI Manager

WordPress-plugin voor **Clean Schoonmaakbedrijf B.V.** (Zeist) om SEO, Google Ads,
Search Console, Google Analytics 4, PageSpeed, leadmeting en AI-optimalisatie vanuit
één Nederlandstalig dashboard te beheren.

> Doel: meer kwalitatieve bezoekers en offerteaanvragen. De plugin geeft inzicht en
> voorstellen; posities in Google worden nergens gegarandeerd.

---

## 1. Wat zit erin

| Menu | Functie |
|---|---|
| **Dashboard** | Kerncijfers (SEO-score, leads, organische klikken, GA4-sessies, Ads-kosten, kosten per lead, AI-kosten), grafieken, "eerst aanpakken", voorstellen die op goedkeuring wachten, omgevingsoverzicht. |
| **SEO Analyse** | Scant elke gepubliceerde pagina *zoals Google hem ziet* (live HTML): title, meta description, H1–H6-structuur, interne links, canonical, noindex/X-Robots-Tag, afbeeldingen/alt, JSON-LD, viewport/lang, dunne en (bijna) dubbele content (MinHash, plaatsnamen genormaliseerd zodat sjabloon-stadspagina's worden herkend), opname in de XML-sitemap. Per pagina: fouten, kansen, voorgestelde correctie en een knop "AI-voorstel". PageSpeed (mobiel/desktop) en URL-inspectie (indexstatus bij Google) per pagina. Wekelijkse automatische scan. |
| **Zoekwoorden** | Op echte Search Console-data: doelzoekwoorden, kansen (positie 4–20), lage CTR, kannibalisatie, lokale zoekopdrachten, overlap Ads ↔ organisch. |
| **Lokale SEO** | Matrix diensten × werkgebied (Zeist, Utrecht, Amersfoort, Nieuwegein, Bilthoven, Houten, Driebergen, Doorn), controles per lokale pagina, onderlinge gelijkenis (doorway-risico), NAW-controle. Maakt **geen** stadspagina's, vestigingen, reviews of klantgegevens aan. |
| **AI Optimalisatie** | Claude beoordeelt teksten, schrijft SEO-titels en meta descriptions, beveelt interne links aan, analyseert zoekintentie, signaleert ontbrekende onderwerpen, herschrijft landingspagina's en analyseert Google Ads. Scherm **Origineel / AI-voorstel / Verschillen / Goedkeuren**. Niets wordt automatisch gepubliceerd. |
| **Google Ads** | Alleen-lezen: campagnes, budgetten, kosten, klikken, vertoningen, conversies, kosten per conversie, zoekwoorden (incl. kwaliteitsscore), zoektermen, advertenties (RSA-koppen, sterkte, landingspagina). |
| **Google Search Console** | Klikken, vertoningen, CTR, positie (met vorige periode), top-zoekopdrachten, top-pagina's, apparaten. |
| **Google Analytics** | GA4: sessies, gebruikers, betrokkenheid, belangrijke gebeurtenissen, kanalen, landingspagina's, apparaten. |
| **Conversies en Leads** | Offerteaanvragen, contactformulieren, telefoon-, e-mail-, WhatsApp- en offerteknop-klikken; per dag, per pagina, per formulier. |
| **Technische Controle** | PHP/WP, HTTPS, zichtbaarheid, permalinks, taal, robots.txt, XML-sitemap, sitemap in Search Console, soft-404, meerdere SEO-plugins, dubbele Google-tags, Consent Mode/consentplugin, cache, cron, PageSpeed homepage, veilig logboek. |
| **Rapportages** | Rapport per 7/28/90 dagen, printen als PDF, CSV-export (Excel-vriendelijk, formule-injectie-veilig), optioneel maandrapport per e-mail. |
| **Instellingen** | Google-koppeling, AI, bedrijf/werkgebied, conversies/privacy, rapportages, demomodus. |

## 2. Installatie

1. Download `clean-seo-ads-ai-manager.zip` (in de map `dist/` van deze repository).
2. WordPress → **Plugins → Nieuwe plugin → Plugin uploaden** → kies de ZIP → **Nu installeren** → **Activeren**.
3. Menu **Clean SEO & Ads AI** verschijnt (alleen voor beheerders; capability `csaam_manage`).
4. Ga naar **SEO Analyse** en klik **Alle pagina's scannen**.
5. Wilt u eerst rondkijken zonder koppelingen? Zet **Instellingen → Algemeen → Demomodus** aan. Elk scherm toont dan een gele DEMOMODUS-balk; zet hem uit vóór u echte beslissingen neemt.

**Vereisten:** WordPress 6.2+, PHP 7.4+ (8.2+ aanbevolen), uitgaande HTTPS naar `*.googleapis.com`, `accounts.google.com`, `oauth2.googleapis.com` en `api.anthropic.com`, en loopback-verzoeken naar de eigen site (voor de volledige SEO-scan; anders valt de scan terug op alleen de inhoud).

## 3. Configuratie

### 3.1 Geheimen veilig opslaan (aanbevolen)

Zet sleutels bij voorkeur in `wp-config.php` (boven *"That's all, stop editing"*). Ze verschijnen dan nooit in de database of het beheerscherm:

```php
define( 'CSAAM_ANTHROPIC_API_KEY', '…' );     // Claude API-sleutel
define( 'CSAAM_GOOGLE_CLIENT_SECRET', '…' );  // OAuth Client Secret
define( 'CSAAM_PAGESPEED_API_KEY', '…' );     // optioneel
define( 'CSAAM_ENCRYPTION_KEY', '…lange willekeurige string…' ); // optioneel, sleutel voor versleuteling in de database
```

Ingevulde sleutels in het beheerscherm worden versleuteld opgeslagen (libsodium `secretbox`, of AES-256-GCM als fallback) met een sleutel uit `CSAAM_ENCRYPTION_KEY` of de WordPress-salts. Wijzigen van de salts maakt opgeslagen geheimen onleesbaar; voer ze dan opnieuw in en koppel Google opnieuw. **Stuur sleutels of wachtwoorden nooit via e-mail of chat.**

### 3.2 Google (Ads, Search Console, GA4) — actuele methode sinds 9 september 2026

Sinds **9 september 2026** hoort het toegangsniveau van de Google Ads API bij het **Google Cloud-project** (van de OAuth-client) en niet meer bij een developer token. De `developer-token`-header is optioneel en wordt door Google genegeerd. Een nieuw project heeft automatisch **Test**-toegang (alleen testaccounts); voor uw echte account heeft u **Explorer**-toegang nodig (2.880 operaties/dag op productieaccounts — ruim voldoende voor deze alleen-lezen rapportages).

1. **Google Cloud Console** → nieuw project (één project voor alleen deze website).
2. **APIs & Services → Bibliotheek** → inschakelen:
   - Google Ads API
   - Google Search Console API
   - Google Analytics Data API
   - Google Analytics Admin API
   - PageSpeed Insights API
3. **Google Ads API → Overzicht** → **Explorer-toegang aanvragen**. Tot die is toegekend geeft een echt Ads-account de fout `CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION` (de plugin legt dit uit). Let op bekende problemen bij Google (oktober 2026): Explorer wordt geweigerd bij projecten met een Free Trial of uitgeschakelde facturering.
4. **OAuth-toestemmingsscherm**: type *Extern*, scopes toevoegen (zie tabel), publicatiestatus **In productie** (in "Testen" verlopen tokens na 7 dagen).
5. **Credentials → OAuth-client-ID → Webapplicatie** met als geautoriseerde redirect-URI:
   `https://cleanschoonmaakbedrijf.nl/wp-admin/admin-post.php?action=csaam_google_callback`
   (de exacte URI staat ook in Instellingen → Stappenplan).
6. In WordPress: **Instellingen** → Client ID + Client Secret → opslaan → **Koppelen met Google** (met het Google-account dat toegang heeft tot Ads, Search Console en GA4).
7. Klik **Accounts ophalen uit Google** en kies Search Console-property, GA4-property-ID en Google Ads-klant-ID. Gebruikt u een beheerdersaccount (MCC), vul dan ook het *login-customer-id* in.

### 3.3 Claude (AI)

1. Maak een API-sleutel op platform.claude.com en zet die in `wp-config.php` (`CSAAM_ANTHROPIC_API_KEY`) of bij **Instellingen → AI**.
2. Kies het model:
   | Model | Prijs (input/output per 1M tokens) | Gebruik |
   |---|---|---|
   | Claude Opus 5.5 (standaard) | $4 / $20 | Beste kwaliteit, landingspagina's en Ads-analyse |
   | Claude Sonnet 5.5 | $2 / $10 | Sneller en goedkoper |
   | Claude Haiku 5.5 | $0,10 / $0,50 | Titels en descriptions in bulk |
3. Stel **maandbudget** (USD), **max. tokens** en **max. verzoeken per uur** in. Bij het bereiken van het budget worden nieuwe verzoeken geblokkeerd.
4. "Automatische fallback bij weigering" laat Anthropic een door de veiligheidsfilters geweigerd verzoek op een ander model afhandelen (Opus/Sonnet; beta `server-side-fallback-2026-07-01`).

Wat de AI krijgt: de zichtbare paginatekst, kopstructuur, huidige titel/description, uw bedrijfscontext (naam, plaats, werkgebied, diensten, door u bevestigde USP's) en — indien gekoppeld — Search Console-zoekopdrachten van die pagina. **Nooit**: API-sleutels, formulierinzendingen, persoonsgegevens. De AI krijgt de opdracht geen feiten, adressen, prijzen, reviews of keurmerken te verzinnen en zet `[AANVULLEN: …]` waar alleen u de informatie kunt geven.

### 3.4 Goedkeuringsflow

| Voorstel | Bij "Goedkeuren" |
|---|---|
| SEO-titel / meta description | U kiest een optie, past hem eventueel aan (live verschillen + tekenteller), en de tekst wordt opgeslagen in **Rank Math / Yoast / AIOSEO / SEOPress**. Zonder SEO-plugin in eigen velden (alleen zichtbaar als u "Eigen title/description uitvoeren" aanzet). |
| Landingspagina verbeteren | Er wordt een **conceptpagina** aangemaakt. De live pagina blijft ongewijzigd tot u het concept zelf controleert en publiceert. |
| Beoordeling, interne links, zoekintentie, onderwerpen, Google Ads | Advies → takenlijst. De plugin voert niets uit, **ook niets in Google Ads**. |

### 3.5 Conversies en privacy (AVG)

- Formulierinzendingen worden **server-side** geteld via Contact Form 7, Gravity Forms, WPForms, Elementor Pro, Fluent Forms, Ninja Forms en Formidable. Opgeslagen: type, formuliernaam, paginapad (zonder querystring), tijdstip. **Geen** ingevulde gegevens.
- Klikken op `tel:`, `mailto:`, WhatsApp en optionele offerteknoppen (CSS-selectors) worden met een **cookieloze** beacon geteld. Geen IP-adressen opgeslagen (alleen kortstondig gehasht voor rate limiting), alleen verzoeken vanaf de eigen site, ingelogde medewerkers tellen niet mee.
- Formulieren met een naam die "offerte" bevat (instelbaar) tellen als offerteaanvraag.
- **Geen dubbele tracking:** de plugin plaatst zelf nooit een GA4/Ads-tag. Staat GTM of gtag (bijv. Site Kit) al op de site, dan worden `generate_lead`, `phone_click`, `email_click`, `whatsapp_click` en `quote_cta_click` doorgestuurd — via de dataLayer bij GTM, anders via `gtag('event')`. Google **Consent Mode** blijft leidend.
- Met de **WP Consent API** (Complianz, CookieYes, …) en "Wacht op toestemming" aan wordt pas na toestemming voor statistieken geteld.
- Bewaartermijnen instelbaar (standaard: logboek 30 dagen, leads 400 dagen).
- Markeer in GA4 `generate_lead` en `phone_click` als *belangrijke gebeurtenis* en importeer ze desgewenst in Google Ads.

## 4. Overzicht vereiste API-toegang

| Dienst | API / endpoint | Scope / sleutel | Toegang |
|---|---|---|---|
| Google Ads | Google Ads API **v26** — `customers:listAccessibleCustomers`, `customers/{id}/googleAds:search` (GAQL) | `https://www.googleapis.com/auth/adwords` | Alleen-lezen in code; Explorer-toegang op het Cloud-project |
| Search Console | Webmasters v3 `sites`, `searchAnalytics/query`, `sitemaps`; `searchconsole.googleapis.com/v1/urlInspection/index:inspect` | `…/auth/webmasters.readonly` | Gebruiker moet eigenaar/volledige gebruiker van de property zijn |
| Google Analytics 4 | Analytics Data API v1beta `runReport`; Admin API v1beta `accountSummaries` | `…/auth/analytics.readonly` | Kijker-rol op de property |
| PageSpeed Insights | `pagespeedonline/v5/runPagespeed` | optionele API-sleutel | Publiek |
| Claude | `api.anthropic.com/v1/messages` (`anthropic-version: 2026-10-21`) | API-sleutel | Betaald per token |

De Google Ads-scope bestaat alleen als volledige scope. Daarom bevat de code **geen enkele mutate-aanroep** en weigert `Google_Ads::search()` alles wat geen `SELECT`-query is.

## 5. Beveiliging

- Alle schermen en REST-routes vereisen `csaam_manage` (alleen beheerders); REST via `wp_rest`-nonce; formulieren via `check_admin_referer`; inhoudelijke wijzigingen controleren daarnaast `edit_post`.
- Eén publieke route (`POST /wp-json/csaam/v1/event`): alleen vaste eventtypes, origin-controle, rate limit per (gehasht) IP en globaal, geen persoonsgegevens.
- OAuth 2.0 met `state` + **PKCE (S256)**; refresh token versleuteld; ontkoppelen trekt het token bij Google in.
- Alle invoer gesanitized, alle uitvoer ge-escaped; AI-HTML door `wp_kses` (alleen koppen, alinea's, lijsten, nadruk, links); CSV formule-injectie-veilig.
- Caching (transients, standaard 6 uur, groepsgewijs ongeldig te maken), rate limiting per API, automatische afkoelperiode na HTTP 429/503, daglimiet voor Ads-operaties.
- Logboek redigeert automatisch API-sleutels, tokens, e-mailadressen en telefoonnummers; prompts en paginateksten worden nooit gelogd.
- Geen wijzigingen aan WordPress core; deactiveren stopt alleen de geplande taken; verwijderen ruimt tabellen, opties en capability op (toegepaste SEO-teksten en concepten blijven bestaan).

## 6. Samenwerking met andere plugins

| Plugin | Gedrag |
|---|---|
| Rank Math / Yoast / AIOSEO / SEOPress | Gedetecteerd; titels/descriptions worden in hún velden geschreven. Geen eigen metadata, sitemaps of schema. Meerdere SEO-plugins tegelijk → foutmelding in Technische Controle. |
| Site Kit / GTM4WP / MonsterInsights / handmatige tags | Gedetecteerd; plugin plaatst geen eigen tag; dubbel ladende Google-tags worden gesignaleerd. |
| Complianz / CookieYes / Cookiebot / Borlabs | Gedetecteerd; WP Consent API wordt gerespecteerd. |
| Elementor / Divi / WPBakery / Bricks | Herschreven landingspagina's komen als concept; overzetten in de paginabouwer gebeurt handmatig. |

## 7. Getest

Lokaal op **WordPress 7.1.4 + PHP 8.3** (SQLite), oktober 2026:

- Activatie, tabellen, rechten, alle 12 schermen zonder PHP-fouten/-waarschuwingen; responsive gecontroleerd op 1440 px en 390 px (geen horizontale overflow).
- SEO-scan op testpagina's: o.a. 404, dubbele H1, ontbrekende alt, overgeslagen kopniveau en **90% gelijke stadspagina's (Zeist/Utrecht)** correct gedetecteerd.
- Demomodus op alle Google-schermen; AI-flow (voorstel → opties → live verschillen → goedkeuren) inclusief conceptpagina en "al besloten"-beveiliging (HTTP 409).
- Instellingen opslaan, versleuteling van geheimen, OAuth-redirect (state + PKCE), ongeldige callback geweigerd.
- Echte foutafhandeling richting `api.anthropic.com` (ongeldige sleutel → nette melding, gelogd zonder sleutel) en PageSpeed API.
- Leadbeacon vanuit de browser, origin-controle, server-side formuliertelling (CF7-hook gesimuleerd) met offerteclassificatie en weggefilterde querystring; Rank Math-veldmapping gesimuleerd.
- WordPress Coding Standards (WPCS 3) + PHPCompatibilityWP (7.4+): geen fouten in de plugincode; resterende meldingen zijn waarschuwingen over ongebruikte hook-parameters.

**Nog niet getest** (vereist uw accounts): echte Google Ads-/Search Console-/GA4-responses en een echte Claude-respons. Test na installatie eerst op een staging-site of met de demomodus, koppel daarna uw accounts.

## 8. Ontwikkeling

```bash
# Codestandaard
phpcs            # gebruikt phpcs.xml.dist (WPCS + PHPCompatibilityWP)
# ZIP bouwen
./build-zip.sh   # → ../dist/clean-seo-ads-ai-manager.zip
```

Filters: `csaam_ai_providers` (extra AI-provider die `CSAAM\AI\Provider` implementeert).
