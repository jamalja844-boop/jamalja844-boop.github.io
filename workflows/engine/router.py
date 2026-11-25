#!/usr/bin/env python3
"""Router-agent engine: bepaalt afdeling, agent(s), skills, tools, samenwerkingsvorm en goedkeuringsplicht.

Gebruik:
    python3 workflows/engine/router.py "Schrijf 5 Instagram-posts voor de lancering"
    echo "..." | python3 workflows/engine/router.py -
Output: JSON (deterministisch, geen API-kosten).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import AGENTS_DIR, contains_keyword, load_registry, normalize, parse_frontmatter  # noqa: E402


def agent_tools(agent: str) -> list[str]:
    path = AGENTS_DIR / f"{agent}.md"
    if not path.exists():
        return []
    meta, _ = parse_frontmatter(path)
    tools = meta.get("tools", [])
    if isinstance(tools, str):
        tools = [t.strip() for t in tools.split(",") if t.strip()]
    return tools


def department_of(agent: str, reg: dict) -> str:
    for dept, members in reg["departments"].items():
        if agent in members:
            return dept
    return "onbekend"


def route(task: str, reg: dict | None = None) -> dict:
    reg = reg or load_registry()
    text = normalize(task)

    scores: dict[str, int] = {}
    hits: dict[str, list[str]] = {}
    for agent, cfg in reg["agents"].items():
        matched = [kw for kw in cfg["keywords"] if contains_keyword(text, kw)]
        if matched:
            # langere/specifiekere trefwoorden wegen zwaarder
            scores[agent] = sum(2 if (" " in kw or len(kw) >= 7) else 1 for kw in matched)
            hits[agent] = matched

    ranked = sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))
    # Generieke uitvoer-agents alleen als ondersteuning wanneer er een specialist is
    generic = {"tool-runner", "router", "approval-gate"}
    specialists = [a for a, _ in ranked if a not in generic]
    if specialists:
        primary = specialists[0]
    elif ranked:
        primary = ranked[0][0]
    else:
        primary = "ceo"

    top = scores.get(primary, 0)
    supporting = [a for a, s in ranked if a != primary and a not in generic and s >= max(1, top // 2)][:4]

    pipeline = None
    for name, p in reg.get("pipelines", {}).items():
        if any(contains_keyword(text, t) for t in p["triggers"]):
            pipeline = p["workflow"]
            break

    agents = [primary] + supporting
    departments = sorted({department_of(a, reg) for a in agents})
    if pipeline == "sequential-delivery":
        mode = "sequential"
    elif len(agents) > 1 or pipeline == "parallel-fanout":
        mode = "parallel"
    else:
        mode = "single"

    approvals = []
    for rule in reg.get("approval_rules", []):
        found = [kw for kw in rule["keywords"] if contains_keyword(text, kw)]
        if found:
            approvals.append({"id": rule["id"], "reden": rule["label"], "trefwoorden": found})

    skills: list[str] = []
    for a in agents:
        for s in reg["agents"].get(a, {}).get("skills", []):
            if s not in skills:
                skills.append(s)
    if approvals and "human-approval" not in skills:
        skills.append("human-approval")
    if "quality-gate" not in skills:
        skills.append("quality-gate")

    tools: list[str] = []
    for a in agents:
        for t in agent_tools(a):
            if t not in tools:
                tools.append(t)

    orchestrator_needed = mode != "single" or len(departments) > 1
    return {
        "opdracht": task.strip(),
        "afdeling": department_of(primary, reg),
        "afdelingen": departments,
        "primaire_agent": primary,
        "ondersteunende_agents": supporting,
        "samenwerking": mode,
        "workflow": pipeline or ("parallel-fanout" if mode == "parallel" else None),
        "orchestrator_nodig": orchestrator_needed,
        "skills": skills,
        "tools": tools,
        "toestemming_nodig": bool(approvals),
        "toestemming": approvals,
        "match": hits,
        "zekerheid": "hoog" if top >= 3 else ("middel" if top >= 1 else "laag - CEO beslist"),
    }


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 2
    task = sys.stdin.read() if argv[1] == "-" else " ".join(argv[1:])
    print(json.dumps(route(task), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
