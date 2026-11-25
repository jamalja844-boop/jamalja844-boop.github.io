# Workflow: Parallel uitwaaieren en samenvoegen (Parallel-agent)

**Wanneer:** een opdracht bestaat uit deeltaken die onafhankelijk van elkaar uitgevoerd kunnen worden (bijv. lancering: SEO-teksten + socialposts + videoscript + offerte).

```
                 +-> seo ----------+
CEO: opsplitsen -+-> social-media -+-> taskboard merge -> qa -> CEO: oplevering
                 +-> video --------+
```

## Uitvoering
1. **Plan** als JSON, elke taak met exclusieve schrijfpaden:
   ```json
   [
     {"id": "seo", "titel": "SEO-meta voor productpagina", "agent": "seo", "paden": ["memory/projects/lancering/seo.md"]},
     {"id": "social", "titel": "3 Instagram-posts", "agent": "social-media", "paden": ["memory/projects/lancering/social.md"]},
     {"id": "review", "titel": "Consistentiecheck", "agent": "qa", "paden": [], "afhankelijk_van": ["seo", "social"]}
   ]
   ```
   `python3 workflows/engine/taskboard.py plan <BOARD> plan.json` - weigert dubbele titels en overlappende paden (conflictpreventie).
2. **Claim** elke startbare taak: `taskboard.py claim <BOARD> <taak> <agent>` (tweede claim op dezelfde taak faalt; taken met open afhankelijkheden zijn niet claimbaar).
3. **Start alle onafhankelijke subagents in één bericht** (meerdere Agent-aanroepen tegelijk). Claude Code voert ze dan gelijktijdig uit. Elke agent krijgt alleen zijn eigen taak, paden en context.
4. **Afronden** per taak: `taskboard.py done <BOARD> <taak> --file <output>`; bij een fout `taskboard.py fail <BOARD> <taak> "<reden>"` (taak komt weer vrij, fout gelogd).
5. **Samenvoegen:** `taskboard.py merge <BOARD>` -> `memory/tasks/<BOARD>/merged.md`. De orchestrator controleert op tegenstrijdigheden; `qa` beoordeelt het geheel.

Alle bestandsbewerkingen van het taakbord gebeuren onder een exclusieve lock, dus gelijktijdige agents kunnen het bord niet corrumperen.
