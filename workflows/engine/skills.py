#!/usr/bin/env python3
"""Skill-agent engine: kiest automatisch de best passende skills voor een opdracht.

Combineert (1) skills die het register aan de gerouteerde agent koppelt en
(2) tekstovereenkomst met name/description/when_to_use van elke SKILL.md.

Gebruik:
    python3 workflows/engine/skills.py "Maak een offerte voor 10 uur schoonmaak"
    python3 workflows/engine/skills.py --list
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import SKILLS_DIR, normalize, parse_frontmatter  # noqa: E402
from router import route  # noqa: E402

STOP = set("de het een en of van voor met naar op in te is om bij als dat die dit wordt worden je jouw mijn uw the a an and or for to of in on with use when this that".split())


def tokens(text: str) -> set[str]:
    words = re.findall(r"[a-z0-9][a-z0-9-]{2,}", normalize(text))
    out = set()
    for w in words:
        if w in STOP:
            continue
        out.add(w)
        if len(w) > 6:
            out.add(w[:6])  # grove stam: offerte/offertes, zoekwoord/zoekwoorden
    return out


def load_skills() -> list[dict]:
    skills = []
    for md in sorted(SKILLS_DIR.glob("*/SKILL.md")):
        meta, _ = parse_frontmatter(md)
        name = meta.get("name") or md.parent.name
        desc = " ".join(str(meta.get(k, "")) for k in ("description", "when_to_use"))
        skills.append({"name": name, "dir": md.parent.name, "description": str(meta.get("description", "")), "_tokens": tokens(name.replace("-", " ") + " " + desc)})
    return skills


def select(task: str, limit: int = 3) -> dict:
    routed = route(task)
    registry_skills = routed["skills"]
    task_tokens = tokens(task)
    scored = []
    for s in load_skills():
        overlap = task_tokens & s["_tokens"]
        score = len(overlap) + (3 if s["name"] in registry_skills[:2] else 0) + (1 if s["name"] in registry_skills else 0)
        if score:
            scored.append({"skill": s["name"], "score": score, "overlap": sorted(overlap)[:8]})
    scored.sort(key=lambda x: (-x["score"], x["skill"]))
    return {"opdracht": task, "agent": routed["primaire_agent"], "gekozen_skills": [s["skill"] for s in scored[:limit]], "kandidaten": scored[: limit + 3]}


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 2
    if argv[1] == "--list":
        print(json.dumps([{"name": s["name"], "description": s["description"][:120]} for s in load_skills()], ensure_ascii=False, indent=2))
        return 0
    print(json.dumps(select(" ".join(argv[1:])), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
