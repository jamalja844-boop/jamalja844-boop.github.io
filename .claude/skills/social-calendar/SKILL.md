---
name: social-calendar
description: 'Maakt een publicatiekalender (week/maand) per bedrijf en platform met thema''s, formats, tijden en status, en vergelijkt die met al ingeplande Metricool-posts. Gebruik voor "maak een contentkalender/publicatieplanning".'
---
# Social calendar
1. Haal bestaande planning op: Metricool `getScheduledPosts` (brandId, periode, timezone Europe/Amsterdam) — voorkom dubbelingen.
2. Kies frequentie per platform (standaard: FB 3×/wk, IG 3–4×/wk + Stories dagelijks, TikTok 3–5×/wk, LinkedIn 2×/wk, YouTube Shorts 2×/wk; pas aan op capaciteit).
3. Verdeel contentpijlers (bijv. Clean: voor/na, tips, team, reviews, offerte-CTA; NobleNest: sfeer, product, cadeau-inspiratie, styling-tips, acties).
4. Voeg seizoensmomenten toe (zie skill content-plan).
5. Tabel: `datum | tijd | platform | format | pijler | onderwerp | CTA | status (idee/concept/goedgekeurd/ingepland)`.
6. Opslaan: `reports/social/<JJJJ-MM-DD>-<bedrijf>-kalender.md`.
