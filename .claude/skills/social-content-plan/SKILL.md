---
name: social-content-plan
description: "Maakt socialmediacontent en contentkalenders per kanaal (TikTok, Instagram, Facebook, YouTube, Google Business Profile) met captions, hashtags, visual-briefing en beste posttijden via Metricool. Gebruik voor posts, contentkalenders en campagnecontent."
---
# Socialmediacontent en contentkalender

1. **Merk bepalen:** welk merk (zie `memory/company/bedrijfskennis.md`)? Metricool-merk ophalen met `getBrandSettings`.
2. **Beste tijden:** `getBestTimeToPostByNetwork` per kanaal (alleen-lezen, gratis).
3. **Content per post:**
   | Datum/tijd | Kanaal | Format | Hook (1e regel) | Caption | CTA | Hashtags (3-8) | Visual-briefing |
4. **Kanaalregels:** TikTok/Reels: hook in 1-2 sec, verticaal 9:16, captions kort; Facebook: iets langer, lokale binding; Google Business: aanbod/nieuws + CTA "Bellen"/"Offerte".
5. **Controle:** spelling, merktoon, geen ongefundeerde claims ("de beste van NL"), geen persoonsgegevens van klanten zonder toestemming.
6. **Publiceren:** standaard alleen concepten. `createScheduledPostForReview` op verzoek; `createScheduledPost` alleen na expliciet akkoord (HITL).
