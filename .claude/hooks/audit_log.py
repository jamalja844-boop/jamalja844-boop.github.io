#!/usr/bin/env python3
"""Audit-/voortgangslog-hook voor PostToolUse, PostToolUseFailure, SubagentStart en SubagentStop.

Schrijft JSONL naar logs/:
  actions.jsonl  - iedere uitgevoerde tool-actie (wie, wat, resultaat ok/fout)
  errors.jsonl   - mislukte tool-acties (foutregistratie)
  agents.jsonl   - start/stop van subagents (agentcommunicatie & voortgang)
  costs.jsonl    - aanroepen van betaalde/gemeterde MCP-tools (API-kostenbewaking)
Gevoelige waarden worden geredigeerd. De hook blokkeert nooit (altijd exit 0).
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(os.environ.get("CLAUDE_PROJECT_DIR") or Path(__file__).resolve().parents[2])
sys.path.insert(0, str(ROOT / "workflows" / "engine"))
from common import LOG_DIR, append_jsonl, now_iso, redact  # noqa: E402

METERED = re.compile(r"mcp__(Semrush|OpenRush|firecrawl|Openart|kloudboard|ElevenLabs|Picsart_Media_Studio|HyperFrames_by_HeyGen|Supermetrics_Marketing_Analytics|Figma)__", re.I)


def short(value, limit: int = 300) -> str:
    text = redact(value if isinstance(value, str) else json.dumps(value, ensure_ascii=False))
    return text if len(text) <= limit else text[:limit] + "…"


def main() -> int:
    try:
        p = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0
    event = p.get("hook_event_name", "")
    base = {"ts": now_iso(), "session": p.get("session_id"), "agent": p.get("agent_type") or "hoofdsessie"}
    try:
        if event in ("PostToolUse", "PostToolUseFailure"):
            tool = p.get("tool_name", "")
            ok = event == "PostToolUse"
            resp = p.get("tool_response")
            if ok and isinstance(resp, dict) and (resp.get("is_error") or resp.get("interrupted")):
                ok = False
            rec = {**base, "tool": tool, "input": short(p.get("tool_input", {})), "ok": ok}
            if not ok:
                rec["fout"] = short(p.get("error") or resp or "", 500)
                append_jsonl(LOG_DIR / "errors.jsonl", rec)
            append_jsonl(LOG_DIR / "actions.jsonl", rec)
            if METERED.match(tool):
                append_jsonl(LOG_DIR / "costs.jsonl", {**base, "tool": tool})
        elif event in ("SubagentStart", "SubagentStop"):
            rec = {**base, "event": event, "agent": p.get("agent_type") or p.get("subagent_type") or base["agent"], "agent_id": p.get("agent_id")}
            if event == "SubagentStop" and p.get("last_assistant_message"):
                rec["samenvatting"] = short(p["last_assistant_message"], 500)
            append_jsonl(LOG_DIR / "agents.jsonl", rec)
    except OSError:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
