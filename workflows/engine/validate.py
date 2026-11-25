#!/usr/bin/env python3
"""Valideert de volledige multi-agent configuratie. Exitcode 0 = geldig.

Controleert agents (frontmatter, tools, model, skills), skills (SKILL.md), register,
hooks in settings.json, .mcp.json (geen letterlijke geheimen) en workflowbestanden.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import AGENTS_DIR, ROOT, SKILLS_DIR, load_registry, parse_frontmatter  # noqa: E402

BUILTIN_TOOLS = {"Agent", "Bash", "Read", "Write", "Edit", "Glob", "Grep", "WebFetch", "WebSearch", "NotebookEdit", "Skill", "TaskCreate", "TaskUpdate", "TaskList", "TaskGet", "AskUserQuestion"}
MODELS = {"sonnet", "opus", "haiku", "fable", "inherit"}
COLORS = {"red", "blue", "green", "yellow", "purple", "orange", "pink", "cyan"}
KNOWN_MCP_SERVERS = {"github", "Shopify", "Metricool_Social_Media_Management", "Google_Drive", "Figma", "Semrush", "OpenRush", "firecrawl", "Supermetrics_Marketing_Analytics", "HyperFrames_by_HeyGen", "ElevenLabs"}
REQUIRED_AGENTS = {"ceo", "project-manager", "research", "software-developer", "frontend", "backend", "ui-ux", "security", "qa", "marketing", "seo", "social-media", "sales", "finance", "automation", "customer-service", "hr", "video", "e-commerce", "browser", "router", "approval-gate", "tool-runner", "skill-curator"}


def as_list(v) -> list[str]:
    if v is None:
        return []
    if isinstance(v, str):
        return [t.strip() for t in v.split(",") if t.strip()]
    return list(v)


def validate() -> list[str]:
    errors: list[str] = []
    skills = {p.parent.name for p in SKILLS_DIR.glob("*/SKILL.md")}

    # Skills
    for md in SKILLS_DIR.glob("*/SKILL.md"):
        meta, body = parse_frontmatter(md)
        if not meta.get("description"):
            errors.append(f"skill {md.parent.name}: description ontbreekt")
        if meta.get("name") and meta["name"] != md.parent.name:
            errors.append(f"skill {md.parent.name}: name '{meta['name']}' wijkt af van mapnaam")
        if len(body.strip()) < 50:
            errors.append(f"skill {md.parent.name}: inhoud te kort")

    # Agents
    found = set()
    for md in AGENTS_DIR.glob("*.md"):
        meta, body = parse_frontmatter(md)
        name = meta.get("name")
        found.add(name)
        where = f"agent {md.name}"
        if name != md.stem:
            errors.append(f"{where}: name '{name}' wijkt af van bestandsnaam")
        if not meta.get("description") or len(str(meta["description"])) < 40:
            errors.append(f"{where}: description ontbreekt of te kort")
        if meta.get("model") and meta["model"] not in MODELS:
            errors.append(f"{where}: onbekend model {meta['model']}")
        if meta.get("color") and meta["color"] not in COLORS:
            errors.append(f"{where}: ongeldige kleur {meta['color']}")
        for t in as_list(meta.get("tools")):
            if t.startswith("mcp__"):
                server = t.split("__")[1]
                if server not in KNOWN_MCP_SERVERS:
                    errors.append(f"{where}: MCP-server '{server}' is niet als verbonden geregistreerd")
            elif t not in BUILTIN_TOOLS:
                errors.append(f"{where}: onbekende tool '{t}'")
        for s in as_list(meta.get("skills")):
            if s not in skills:
                errors.append(f"{where}: skill '{s}' bestaat niet")
        for section in ("## Verplicht outputformaat", "STATUS:"):
            if section not in body:
                errors.append(f"{where}: mist '{section}'")
    missing = REQUIRED_AGENTS - found
    if missing:
        errors.append(f"verplichte agents ontbreken: {sorted(missing)}")

    # Orchestrator moet kunnen delegeren; router moet alleen-lezen zijn
    ceo, _ = parse_frontmatter(AGENTS_DIR / "ceo.md") if (AGENTS_DIR / "ceo.md").exists() else ({}, "")
    if "Agent" not in as_list(ceo.get("tools")):
        errors.append("ceo mist de Agent-tool (kan niet delegeren)")
    router, _ = parse_frontmatter(AGENTS_DIR / "router.md") if (AGENTS_DIR / "router.md").exists() else ({}, "")
    if {"Write", "Edit", "Agent"} & set(as_list(router.get("tools"))):
        errors.append("router mag geen schrijf-/delegatietools hebben")
    gate, _ = parse_frontmatter(AGENTS_DIR / "approval-gate.md") if (AGENTS_DIR / "approval-gate.md").exists() else ({}, "")
    if any(t.startswith("mcp__") or t == "Bash" for t in as_list(gate.get("tools"))):
        errors.append("approval-gate mag geen uitvoerende tools hebben")

    # Register
    reg = load_registry()
    for agent, cfg in reg["agents"].items():
        if agent not in found:
            errors.append(f"register: agent '{agent}' heeft geen bestand")
        for s in cfg.get("skills", []):
            if s not in skills:
                errors.append(f"register: skill '{s}' van {agent} bestaat niet")
    in_depts = {a for members in reg["departments"].values() for a in members}
    for a in found - in_depts:
        errors.append(f"register: agent '{a}' hoort bij geen afdeling")

    # Settings + hooks
    try:
        settings = json.loads((ROOT / ".claude" / "settings.json").read_text())
        for event, groups in settings.get("hooks", {}).items():
            for g in groups:
                for h in g.get("hooks", []):
                    m = re.search(r"\.claude/hooks/([\w.-]+)", h.get("command", ""))
                    if m and not (ROOT / ".claude" / "hooks" / m.group(1)).exists():
                        errors.append(f"hook {event}: script {m.group(1)} ontbreekt")
        if "PreToolUse" not in settings.get("hooks", {}):
            errors.append("settings: PreToolUse-hooks (HITL/ACL) ontbreken")
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"settings.json ongeldig: {exc}")

    # .mcp.json: geen letterlijke geheimen
    mcp = ROOT / ".mcp.json"
    if mcp.exists():
        try:
            data = json.loads(mcp.read_text())
            for name, srv in data.get("mcpServers", {}).items():
                for k, v in {**srv.get("env", {}), **srv.get("headers", {})}.items():
                    if v and not re.fullmatch(r".*\$\{[A-Z0-9_]+(:-[^}]*)?\}.*", str(v)):
                        errors.append(f".mcp.json {name}.{k}: letterlijke waarde; gebruik ${{VAR}}")
        except json.JSONDecodeError as exc:
            errors.append(f".mcp.json ongeldig: {exc}")

    for wf in ("sequential-delivery.md", "parallel-fanout.md"):
        if not (ROOT / "workflows" / wf).exists():
            errors.append(f"workflow {wf} ontbreekt")
    if not (ROOT / "CLAUDE.md").exists():
        errors.append("CLAUDE.md ontbreekt")
    return errors


def main() -> int:
    errs = validate()
    agents = len(list(AGENTS_DIR.glob("*.md")))
    skills = len(list(SKILLS_DIR.glob("*/SKILL.md")))
    if errs:
        print(f"ONGELDIG ({len(errs)} fouten):")
        for e in errs:
            print("  -", e)
        return 1
    print(f"GELDIG: {agents} agents, {skills} skills, register, hooks en workflows in orde.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
