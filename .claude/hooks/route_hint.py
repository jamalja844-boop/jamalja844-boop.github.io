#!/usr/bin/env python3
"""UserPromptSubmit-hook: voegt een compacte, deterministische routeringshint toe aan de context.

Kosteloos (geen model-aanroep). Uitschakelen: zet AGENT_ROUTE_HINT=0.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(os.environ.get("CLAUDE_PROJECT_DIR") or Path(__file__).resolve().parents[2])
sys.path.insert(0, str(ROOT / "workflows" / "engine"))


def main() -> int:
    if os.environ.get("AGENT_ROUTE_HINT", "1") == "0":
        return 0
    try:
        p = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0
    prompt = str(p.get("prompt", ""))
    if len(prompt) < 20 or prompt.startswith("/"):
        return 0
    try:
        from router import route

        r = route(prompt[:4000])
    except Exception:  # hint is optioneel; nooit de prompt blokkeren
        return 0
    agents = [r["primaire_agent"]] + r["ondersteunende_agents"]
    hint = (
        f"[router] afdeling={r['afdeling']} agents={','.join(agents)} samenwerking={r['samenwerking']}"
        f" workflow={r['workflow'] or '-'} skills={','.join(r['skills'][:4])}"
        f" toestemming={'JA: ' + ', '.join(a['id'] for a in r['toestemming']) if r['toestemming_nodig'] else 'nee'}"
        f" zekerheid={r['zekerheid']} (hint; de orchestrator beslist)"
    )
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": hint}}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
