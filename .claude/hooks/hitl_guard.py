#!/usr/bin/env python3
"""Human-in-the-loop PreToolUse-hook.

Elke tool-aanroep met externe, onomkeerbare of kostenverhogende gevolgen krijgt
permissionDecision "ask": Claude Code toont de gebruiker dan een expliciete
toestemmingsvraag (met reden). In headless/automatische modus zonder mens wordt
de actie daardoor NIET uitgevoerd.

Categorieën: e-mail/berichten, betalingen, advertentiebudget, publiceren,
definitief verwijderen, productiesystemen, delen van vertrouwelijke gegevens,
betaalde generaties (API-kosten). Elke beslissing wordt gelogd in logs/hitl.jsonl.
"""
from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(os.environ.get("CLAUDE_PROJECT_DIR") or Path(__file__).resolve().parents[2])
LOG = Path(os.environ.get("AGENT_LOG_DIR") or ROOT / "logs") / "hitl.jsonl"

PROTECTED_BRANCHES = r"(main|master|gh-pages|production|prod|live)"

BASH_RULES = [
    ("publish", r"\bgit\s+push\b[^|;&]*\b" + PROTECTED_BRANCHES + r"\b", "Push naar productiebranch (GitHub Pages: maakt wijzigingen direct openbaar)"),
    ("production", r"\bgit\s+push\b[^|;&]*(\s--force\b|\s-f\b|\s--force-with-lease\b|\s--delete\b|\s:)", "Geforceerde/verwijderende git push"),
    ("delete", r"\brm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s+)+", "Recursief/geforceerd verwijderen van bestanden"),
    ("delete", r"\b(shred|git\s+clean\s+-[a-zA-Z]*f|git\s+reset\s+--hard|find\b[^|]*\s-delete\b|truncate\s+-s\s*0)", "Definitief verwijderen/overschrijven van data"),
    ("email", r"(^|[;&|(]\s*|\bsudo\s+)(sendmail|mailx?|mutt|swaks)\s|\bsmtplib\b|smtp://|\bcurl\b[^|]*--mail-rcpt", "E-mail versturen"),
    ("publish", r"\b(npm|pnpm|yarn)\s+publish\b|\bgh\s+release\b|\bvercel\b.*--prod|\bnetlify\s+deploy\b.*--prod|\bshopify\s+theme\s+(push|publish)\b|\bwp\s+post\s+(create|update)\b", "Publiceren naar een openbaar/productiesysteem"),
    ("external", r"\bcurl\b[^|]*(-X\s*(POST|PUT|PATCH|DELETE)|--data\b|-d\s)|\bwget\b[^|]*--post", "Schrijvende HTTP-aanroep naar een externe dienst"),
    ("production", r"\b(psql|mysql)\b[^|]*\b(drop|delete|truncate|alter|update)\b|\bsupabase\s+db\s+(push|reset)\b", "Wijziging aan (productie)database"),
]

# MCP-toolnaam (deel na de servernaam) -> categorie
MCP_RULES = [
    ("email", r"(send|reply|forward).*(mail|message|email)|^send_|send_message|reply_to_comment|send_chat_message|outbound_call|submit_batch_call", "Bericht/e-mail/oproep naar externen"),
    ("payment", r"payment|checkout|buy_credits|purchase|refund|payout|phone_reserve|invoice_send", "Betaling of aankoop"),
    ("ad_budget", r"manage_campaign|budget|bid|activation_audience_create|activation_query_run", "Advertentiecampagne/budget wijzigen"),
    ("publish", r"publish|createscheduledpost$|updatescheduledpost|sendscheduledpostforreview|theme_commit|create_deployment|merge_pull_request|enable_pr_auto_merge|create_release", "Content of code openbaar publiceren"),
    ("delete", r"delete|trash|remove|destroy|unpublish|bulk_delete", "Definitief verwijderen"),
    ("production", r"graphql_mutation|set-inventory|bulk-update|create-discount|update-collection|execute_action|execute_sql|apply_patch|update_settings|switch-shop|create_store", "Wijziging aan productiesysteem (winkel/database/account)"),
    ("confidential", r"share_file|share|permission|request_access|create_secret|update_secret|manage_team|manage_user", "Delen van gegevens of toegangsrechten"),
    ("cost", r"generate_(image|video|audio|thumbnail|speech)|generate_image_batch|generate_video_batch|creative_generate|run_flow_nodes|openart_generate|render_video|render_project|firecrawl_agent$|deep_research|weave_run|phone_start_device", "Betaalde generatie/actie (API-kosten/credits)"),
]

# Direct naar main pushen via GitHub-API
GITHUB_WRITE = re.compile(r"^(push_files|create_or_update_file|delete_file)$")


def log(record: dict) -> None:
    try:
        LOG.parent.mkdir(parents=True, exist_ok=True)
        with LOG.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")
    except OSError:
        pass


def classify(tool: str, tool_input: dict) -> tuple[str, str] | None:
    if tool == "Bash":
        cmd = str(tool_input.get("command", ""))
        for cat, pat, label in BASH_RULES:
            if re.search(pat, cmd, re.I):
                return cat, label
        return None
    if tool.startswith("mcp__"):
        parts = tool.split("__", 2)
        name = parts[2] if len(parts) == 3 else tool
        server = parts[1] if len(parts) == 3 else ""
        if server.lower() == "github" and GITHUB_WRITE.match(name):
            branch = str(tool_input.get("branch", ""))
            if re.fullmatch(PROTECTED_BRANCHES, branch) or not branch:
                return "publish", "Directe commit naar productiebranch via GitHub-API"
            return None
        if re.match(r"(get|list|search|read|fetch|describe|inspect|query|show|find)[_-]", name, re.I) and not re.search(r"generate|publish|send", name, re.I):
            return None  # alleen-lezen
        for cat, pat, label in MCP_RULES:
            if re.search(pat, name, re.I):
                return cat, label
    return None


def summarize(tool: str, tool_input: dict) -> str:
    text = json.dumps(tool_input, ensure_ascii=False)
    return text if len(text) <= 400 else text[:400] + "…"


def decide(payload: dict) -> dict | None:
    tool = payload.get("tool_name", "")
    tool_input = payload.get("tool_input") or {}
    hit = classify(tool, tool_input)
    if not hit:
        return None
    cat, label = hit
    agent = payload.get("agent_type") or "hoofdsessie"
    reason = (
        f"TOESTEMMING VEREIST [{cat}] {label}. Agent: {agent}. Tool: {tool}. "
        f"Details: {summarize(tool, tool_input)}. Controleer het voorbereide overzicht voordat je akkoord geeft."
    )
    log({"ts": datetime.now(timezone.utc).isoformat(timespec="seconds"), "session": payload.get("session_id"), "agent": agent, "tool": tool, "categorie": cat, "besluit": "ask"})
    return {"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "ask", "permissionDecisionReason": reason}}


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0
    result = decide(payload)
    if result:
        print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
