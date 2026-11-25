#!/usr/bin/env python3
"""PreToolUse-hook: need-to-know toegang tot memory/ en blokkade van geheimen.

* Subagents (payload bevat agent_type) mogen alleen de memory-gebieden lezen/schrijven
  die memory/acl.json voor hun rol toestaat.
* Geheimen (.env, sleutels, credentials) zijn voor iedereen geblokkeerd.
* Weigering -> permissionDecision "deny" met reden; gelogd in logs/acl.jsonl.
"""
from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(os.environ.get("CLAUDE_PROJECT_DIR") or Path(__file__).resolve().parents[2])
ACL_PATH = ROOT / "memory" / "acl.json"
LOG = Path(os.environ.get("AGENT_LOG_DIR") or ROOT / "logs") / "acl.jsonl"
READ_TOOLS = {"Read", "Glob", "Grep", "NotebookRead"}
WRITE_TOOLS = {"Write", "Edit", "MultiEdit", "NotebookEdit"}


def load_acl() -> dict:
    try:
        return json.loads(ACL_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"rules": {}, "always_deny": [".env"]}


def rel(path: str, cwd: str) -> str:
    p = Path(path)
    if not p.is_absolute():
        p = Path(cwd or ROOT) / p
    try:
        return p.resolve().relative_to(ROOT.resolve()).as_posix()
    except ValueError:
        return p.as_posix()


def is_secret(relpath: str, acl: dict) -> bool:
    name = relpath.rstrip("/").split("/")[-1]
    if name.endswith((".example", ".sample", ".template")):
        return False  # sjablonen zonder echte waarden zijn toegestaan
    for pat in acl.get("always_deny", []):
        if pat.endswith("/"):  # map, bv. secrets/
            if f"/{pat}" in f"/{relpath.rstrip('/')}/":
                return True
        elif pat.endswith("."):  # voorvoegsel, bv. .env.
            if name.startswith(pat):
                return True
        elif pat.startswith(".") and "/" not in pat:  # extensie of dotfile, bv. .pem / .env
            if name == pat or name.endswith(pat):
                return True
        elif name == pat or relpath == pat:
            return True
    return False


def rule_for(relpath: str, acl: dict) -> dict | None:
    best, best_len = None, -1
    for prefix, rule in acl.get("rules", {}).items():
        if (relpath == prefix or relpath.startswith(prefix) or relpath + "/" == prefix) and len(prefix) > best_len:
            best, best_len = rule, len(prefix)
    return best


def allowed(agent: str, relpath: str, mode: str, acl: dict) -> bool:
    rule = rule_for(relpath, acl)
    if rule is None:
        return True
    who = rule.get(mode, [])
    return "*" in who or agent in who


def targets(tool: str, ti: dict, cwd: str) -> list[tuple[str, str]]:
    out = []
    if tool in READ_TOOLS | WRITE_TOOLS:
        mode = "write" if tool in WRITE_TOOLS else "read"
        for key in ("file_path", "path", "notebook_path"):
            if ti.get(key):
                out.append((rel(str(ti[key]), cwd), mode))
        if tool == "Glob" and ti.get("pattern") and "memory/" in str(ti["pattern"]):
            out.append((rel(str(ti["pattern"]).split("*")[0] or "memory/", cwd), "read"))
    elif tool == "Bash":
        cmd = str(ti.get("command", ""))
        writes = re.search(r"(>|\btee\b|\bmv\b|\bcp\b|\brm\b|\bsed\s+-i)", cmd) is not None
        for m in re.findall(r"(?:\.?/)?(memory/[\w./-]+|\.env[\w.]*|[\w./-]*\.(?:pem|key)\b|credentials\.json|secrets/[\w./-]*)", cmd):
            out.append((m.lstrip("./") if m.startswith("./") else m, "write" if writes else "read"))
    return out


def decide(payload: dict) -> dict | None:
    tool = payload.get("tool_name", "")
    ti = payload.get("tool_input") or {}
    agent = payload.get("agent_type")
    acl = load_acl()
    for relpath, mode in targets(tool, ti, payload.get("cwd", "")):
        reason = None
        if is_secret(relpath, acl):
            reason = f"Toegang geweigerd: '{relpath}' bevat mogelijk geheimen (API-sleutels/wachtwoorden). Gebruik omgevingsvariabelen of de credential-manager."
        elif agent and relpath.startswith("memory/") and not allowed(agent, relpath, mode, acl):
            reason = f"Toegang geweigerd: agent '{agent}' heeft geen {mode}-recht op '{relpath}' (need-to-know, zie memory/acl.json)."
        if reason:
            try:
                LOG.parent.mkdir(parents=True, exist_ok=True)
                with LOG.open("a", encoding="utf-8") as fh:
                    fh.write(json.dumps({"ts": datetime.now(timezone.utc).isoformat(timespec="seconds"), "agent": agent or "hoofdsessie", "tool": tool, "pad": relpath, "mode": mode, "besluit": "deny"}, ensure_ascii=False) + "\n")
            except OSError:
                pass
            return {"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": reason}}
    return None


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0
    res = decide(payload)
    if res:
        print(json.dumps(res, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
