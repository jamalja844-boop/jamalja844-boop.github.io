#!/usr/bin/env python3
"""Automatische kwaliteitspoort.

    quality_gate.py              # configuratie + unittests + geheimenscan + kostenrapport
    quality_gate.py --task ID    # idem, plus: heeft de pipeline-taak een QA-verdict GOEDGEKEURD?

Exitcode 0 = alle controles geslaagd.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import LOG_DIR, MEMORY_DIR, ROOT  # noqa: E402
from validate import validate  # noqa: E402

SECRET = re.compile(r"(sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|shpat_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)")


def check_config() -> tuple[bool, str]:
    errs = validate()
    return (not errs, "configuratie geldig" if not errs else "; ".join(errs[:5]))


def check_tests() -> tuple[bool, str]:
    r = subprocess.run([sys.executable, "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py"], cwd=ROOT, capture_output=True, text=True, timeout=300)
    tail = (r.stderr or r.stdout).strip().splitlines()[-1:] or [""]
    return (r.returncode == 0, tail[0])


def check_secrets() -> tuple[bool, str]:
    files = subprocess.run(["git", "ls-files", "-co", "--exclude-standard"], cwd=ROOT, capture_output=True, text=True).stdout.split()
    hits = []
    for f in files:
        p = ROOT / f
        if p.suffix in {".ttf", ".pdf", ".png", ".jpg", ".gif", ".woff", ".woff2"} or not p.is_file():
            continue
        try:
            if SECRET.search(p.read_text(encoding="utf-8", errors="ignore")):
                hits.append(f)
        except OSError:
            continue
    hits = [h for h in hits if not h.startswith("tests/")]  # testfixtures bevatten nep-sleutels
    return (not hits, "geen geheimen gevonden" if not hits else f"mogelijke geheimen in: {hits}")


def check_task(task_id: str) -> tuple[bool, str]:
    p = MEMORY_DIR / "tasks" / task_id / "task.json"
    if not p.exists():
        return (False, f"taak {task_id} niet gevonden")
    t = json.loads(p.read_text())
    qc = next(s for s in t["stages"] if s["name"] == "kwaliteitscontrole")
    if qc["status"] != "klaar":
        return (False, "kwaliteitscontrole nog niet uitgevoerd")
    text = (p.parent / qc["output"]).read_text()
    ok = re.search(r"VERDICT:\s*GOEDGEKEURD", text, re.I) is not None
    return (ok, "QA: GOEDGEKEURD" if ok else "QA: niet goedgekeurd")


def cost_report() -> str:
    f = LOG_DIR / "costs.jsonl"
    if not f.exists():
        return "geen betaalde/gemeterde tool-aanroepen gelogd"
    c = Counter(json.loads(line)["tool"].split("__")[1] for line in f.read_text().splitlines() if line.strip())
    return ", ".join(f"{k}: {v}x" for k, v in c.most_common()) or "geen"


def main() -> int:
    checks = [("Configuratie", check_config), ("Unittests", check_tests), ("Geheimenscan", check_secrets)]
    if "--task" in sys.argv:
        tid = sys.argv[sys.argv.index("--task") + 1]
        checks.append((f"Taak {tid}", lambda: check_task(tid)))
    all_ok = True
    for name, fn in checks:
        ok, msg = fn()
        all_ok &= ok
        print(f"[{'OK ' if ok else 'FOUT'}] {name}: {msg}")
    print(f"[INFO] API-kosten (gemeterde aanroepen): {cost_report()}")
    print("KWALITEITSPOORT:", "GESLAAGD" if all_ok else "GEFAALD")
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
