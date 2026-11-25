"""Gedeelde testhulp: geïsoleerde memory/logs-mappen en hook-aanroep als subprocess."""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENGINE = ROOT / "workflows" / "engine"
HOOKS = ROOT / ".claude" / "hooks"

_tmp = tempfile.mkdtemp(prefix="agenttest-")
os.environ.setdefault("AGENT_MEMORY_DIR", str(Path(_tmp) / "memory"))
os.environ.setdefault("AGENT_LOG_DIR", str(Path(_tmp) / "logs"))
sys.path.insert(0, str(ENGINE))


def run_hook(name: str, payload: dict) -> dict | None:
    env = {**os.environ, "CLAUDE_PROJECT_DIR": str(ROOT)}
    r = subprocess.run([sys.executable, str(HOOKS / name)], input=json.dumps(payload), capture_output=True, text=True, env=env, timeout=30)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout) if r.stdout.strip() else None


def decision(result: dict | None) -> str:
    if not result:
        return "allow"
    return result["hookSpecificOutput"].get("permissionDecision", "allow")
