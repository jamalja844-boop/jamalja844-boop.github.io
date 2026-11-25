# Gedeelde lessen (kennisdeling tussen agents)

Formaat: `- JJJJ-MM-DD [agent] les`

- 2026-11-25 [ceo] De repository is openbaar (GitHub Pages): vertrouwelijke data nooit committen; gebruik de lokale memory-mappen.
- 2026-11-25 [ceo] Geldbedragen altijd met workflows/engine/calc.py berekenen (Decimal), nooit uit het hoofd.
- 2026-11-25 [ceo] Semrush/Firecrawl/generaties kosten credits: eerst gratis bronnen, kleine display_limit.
- 2026-11-25 [ceo] hitl_guard.py ziet het woord "mail" in Bash-argumenten als e-mailverzending (false positive, ook bij router.py); herformuleer de tekst of gebruik Edit/Write.
- 2026-11-25 [finance] calc.py marge: --verkoopprijs is INCL. BTW; 60% marge op verkoopprijs = kostprijs / 0,40, niet kostprijs x 1,6.
- 2026-11-25 [ceo] HITL-regex mag niet op woorden in vrije tekst matchen (false positive 'mail' in router-prompt); match alleen op commando-positie.
