---
name: social-post-builder
description: 'Bouwt kant-en-klare socialmediaposts (feed, carrousel, Story, Reel, Short) per platform met onderschrift, hashtags, alt-tekst en beeld/videoprompt, en zet ze na goedkeuring klaar in Metricool. Gebruik bij elk verzoek om een post of reel te maken.'
---
# Social post builder
## Formaten
| Platform | Feed | Verticaal (Story/Reel/Short) | Tekstlimiet (praktisch) |
|---|---|---|---|
| Instagram | 1080×1350 (4:5) | 1080×1920 | 2.200 tekens, 3–10 hashtags |
| Facebook | 1080×1350 / 1200×630 | 1080×1920 | kort: 40–80 tekens werkt best |
| TikTok | — | 1080×1920, 15–60 s | 2.200 tekens, 3–5 hashtags |
| LinkedIn | 1200×1200 / 1200×627 | 1080×1920 | 3.000 tekens, 3–5 hashtags |
| YouTube Shorts | — | 1080×1920, ≤ 60 s | titel ≤ 100 |
| X | 1600×900 | — | 280 tekens |
## Output per post (Markdown-blok)
```
Bedrijf / platform / format / doel / publicatiemoment (Europe/Amsterdam)
Hook (eerste regel):
Onderschrift:
CTA:
Hashtags:
Alt-tekst:
Beeld-/videoprompt: (skill ai-media-prompts, met huisstijl + "[officieel logo plaatsen, niet genereren]")
Bronnen (bij cijfers):
```
## Inplannen (Metricool)
1. `getBrandSettings` → brandId en gekoppelde netwerken. Netwerk niet gekoppeld? Meld het; lever bestand.
2. `getBestTimeToPostByNetwork` voor het tijdstip.
3. Na akkoord op concept: `createScheduledPostForReview` (voorkeur) of `createScheduledPost`. Log in `memory/logs/activity-log.md`.
