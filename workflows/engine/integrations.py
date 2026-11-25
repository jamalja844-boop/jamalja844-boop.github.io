#!/usr/bin/env python3
"""Detecteert integraties automatisch zonder geheimen te lezen of te tonen.

Bronnen: .mcp.json (projectservers), .claude/settings.json (plugins), aanwezigheid (niet de
waarde!) van bekende omgevingsvariabelen, lokale CLI-tools, en workflows/integrations.json
(laatst geverifieerde status van claude.ai-connectors).

Gebruik: python3 workflows/engine/integrations.py [--json]
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import ROOT  # noqa: E402

ENV_KEYS = {
    "OpenAI": ["OPENAI_API_KEY"],
    "Supabase": ["SUPABASE_ACCESS_TOKEN", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
    "Shopify (CLI)": ["SHOPIFY_CLI_THEME_TOKEN", "SHOPIFY_ACCESS_TOKEN"],
    "WordPress": ["WORDPRESS_URL", "WORDPRESS_APP_PASSWORD"],
    "Anthropic API": ["ANTHROPIC_API_KEY"],
}


def detect() -> dict:
    out: dict = {"project_mcp_servers": [], "plugins": [], "env_vars_aanwezig": {}, "cli": {}, "connectors": {}}
    mcp = ROOT / ".mcp.json"
    if mcp.exists():
        try:
            out["project_mcp_servers"] = sorted(json.loads(mcp.read_text()).get("mcpServers", {}))
        except json.JSONDecodeError as exc:
            out["project_mcp_servers"] = [f"FOUT in .mcp.json: {exc}"]
    settings = ROOT / ".claude" / "settings.json"
    if settings.exists():
        plugins = json.loads(settings.read_text()).get("enabledPlugins", {})
        out["plugins"] = sorted(k for k, v in plugins.items() if v)
    for name, keys in ENV_KEYS.items():
        present = [k for k in keys if os.environ.get(k)]
        out["env_vars_aanwezig"][name] = present  # alleen namen, nooit waarden
    for tool in ("git", "python3", "node", "npm", "jq", "gh", "claude"):
        out["cli"][tool] = bool(shutil.which(tool))
    try:
        r = subprocess.run(["node", "-e", "require('playwright');console.log('ok')"], capture_output=True, text=True, timeout=20, cwd="/")
        out["cli"]["playwright"] = r.stdout.strip() == "ok"
    except (OSError, subprocess.TimeoutExpired):
        out["cli"]["playwright"] = False
    reg = ROOT / "workflows" / "integrations.json"
    if reg.exists():
        data = json.loads(reg.read_text())
        out["connectors_laatst_geverifieerd"] = data.get("last_verified")
        out["connectors"] = {k: v["status"] for k, v in data["integrations"].items()}
    return out


def main() -> int:
    res = detect()
    if "--json" in sys.argv:
        print(json.dumps(res, ensure_ascii=False, indent=2))
        return 0
    print("Integraties (gedetecteerd):")
    print("  Project-MCP-servers:", ", ".join(res["project_mcp_servers"]) or "geen")
    print("  Plugins:", ", ".join(res["plugins"]) or "geen")
    print("  CLI:", ", ".join(f"{k}={'ja' if v else 'nee'}" for k, v in res["cli"].items()))
    for k, v in res["env_vars_aanwezig"].items():
        print(f"  Sleutels {k}: {'aanwezig (' + ', '.join(v) + ')' if v else 'niet ingesteld'}")
    print(f"  Connectors (geverifieerd {res.get('connectors_laatst_geverifieerd')}):")
    for k, v in res["connectors"].items():
        print(f"    - {k}: {v}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
