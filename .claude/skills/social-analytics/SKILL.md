---
name: social-analytics
description: 'Analyseert socialmediastatistieken en vergelijkt campagnes/periodes met echte data uit Metricool en Supermetrics. Gebruik voor "hoe presteren onze posts", "vergelijk campagne A en B", maandrapporten.'
---
# Social analytics
1. `getAnalyticsAvailableMetrics` → kies metrics per netwerk; daarna `getAnalyticsDataByMetrics` (brandId, periode).
2. Advertenties: Supermetrics `FA` (Facebook Ads, geauthenticeerd), `AW` (Google Ads, geauthenticeerd); TikTok Ads via Metricool.
3. KPI's: bereik, impressies, engagement rate (= interacties / bereik), klikken, CTR, volgersgroei, kosten per lead, ROAS.
4. Vergelijk met vorige periode (Δ en Δ%). Noem top-3 en flop-3 posts met reden-hypothese.
5. Alleen echte cijfers; ontbrekende data = "niet beschikbaar" + reden. Elke tabel: bron + ophaaldatum.
6. Aanbevelingen (max. 5, concreet). Opslaan: `reports/social/<datum>-<bedrijf>-analyse.md`.
