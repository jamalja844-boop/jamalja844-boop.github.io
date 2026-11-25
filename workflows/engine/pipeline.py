#!/usr/bin/env python3
"""Sequential-agent engine: vaste workflow met overdracht van resultaten tussen fasen.

Fasen: analyse -> onderzoek -> ontwerp -> ontwikkeling -> testen -> kwaliteitscontrole -> oplevering

Commando's:
    pipeline.py start "<opdracht>" [--id ID] [--skip onderzoek,ontwerp]
    pipeline.py next ID            # huidige fase + agent + context (resultaten vorige fasen)
    pipeline.py complete ID FASE (--text "..." | --file pad)
    pipeline.py fail ID FASE "reden"     # registreert fout, fase blijft open
    pipeline.py status [ID]

Regels:
  * Een fase kan alleen afgerond worden als alle eerdere (niet-overgeslagen) fasen klaar zijn.
  * 'oplevering' kan pas als 'kwaliteitscontrole' de regel 'VERDICT: GOEDGEKEURD' bevat.
  * Alle in-/uitvoer staat in memory/tasks/<ID>/ (taakgeschiedenis).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import LOG_DIR, MEMORY_DIR, append_jsonl, now_iso, redact  # noqa: E402

STAGES = [
    ("analyse", "project-manager", "Analyseer de opdracht: doel, scope, acceptatiecriteria, risico's, benodigde toestemmingen."),
    ("onderzoek", "research", "Verzamel benodigde informatie en bronnen. Lever feiten met bron."),
    ("ontwerp", "ui-ux", "Maak het ontwerp/de oplossingsarchitectuur op basis van analyse en onderzoek."),
    ("ontwikkeling", "software-developer", "Bouw de oplossing volgens het ontwerp. Noem gewijzigde bestanden."),
    ("testen", "qa", "Test de oplevering daadwerkelijk (commando's + uitkomst). Noem gevonden fouten."),
    ("kwaliteitscontrole", "qa", "Toets op correctheid, volledigheid, beveiliging, prestaties, onderhoudbaarheid, API-kosten. Eindig met 'VERDICT: GOEDGEKEURD' of 'VERDICT: AFGEKEURD'."),
    ("oplevering", "project-manager", "Vat het eindresultaat samen voor de gebruiker, met bewijs van controle."),
]
STAGE_NAMES = [s[0] for s in STAGES]
APPROVED = re.compile(r"VERDICT:\s*GOEDGEKEURD", re.I)


def task_dir(task_id: str) -> Path:
    return MEMORY_DIR / "tasks" / task_id


def load(task_id: str) -> dict:
    p = task_dir(task_id) / "task.json"
    if not p.exists():
        raise SystemExit(f"Onbekende taak: {task_id}")
    return json.loads(p.read_text(encoding="utf-8"))


def save(task: dict) -> None:
    d = task_dir(task["id"])
    d.mkdir(parents=True, exist_ok=True)
    (d / "task.json").write_text(json.dumps(task, ensure_ascii=False, indent=2), encoding="utf-8")


def event(task: dict, kind: str, **data) -> None:
    rec = {"ts": now_iso(), "task": task["id"], "event": kind, **data}
    task.setdefault("history", []).append(rec)
    append_jsonl(LOG_DIR / "pipeline.jsonl", rec)


def start(opdracht: str, task_id: str | None = None, skip: list[str] | None = None) -> dict:
    skip = [s for s in (skip or []) if s]
    for s in skip:
        if s not in STAGE_NAMES or s in ("analyse", "testen", "kwaliteitscontrole", "oplevering"):
            raise SystemExit(f"Fase '{s}' kan niet worden overgeslagen")
    task_id = task_id or "T" + now_iso().replace(":", "").replace("-", "")[:15]
    if (task_dir(task_id) / "task.json").exists():
        raise SystemExit(f"Taak {task_id} bestaat al")
    task = {
        "id": task_id,
        "workflow": "sequential-delivery",
        "opdracht": redact(opdracht),
        "created": now_iso(),
        "stages": [{"name": n, "agent": a, "instructie": i, "status": "overgeslagen" if n in skip else "open", "output": None} for n, a, i in STAGES],
    }
    event(task, "start", skip=skip)
    save(task)
    return task


def current(task: dict) -> dict | None:
    for s in task["stages"]:
        if s["status"] == "open":
            return s
    return None


def context_for(task: dict, stage_name: str) -> str:
    parts = [f"# Opdracht\n{task['opdracht']}"]
    for s in task["stages"]:
        if s["name"] == stage_name:
            break
        if s["status"] == "klaar":
            out = (task_dir(task["id"]) / s["output"]).read_text(encoding="utf-8")
            parts.append(f"# Resultaat fase '{s['name']}' ({s['agent']})\n{out.strip()}")
    return "\n\n".join(parts)


def next_stage(task_id: str) -> dict:
    task = load(task_id)
    s = current(task)
    if not s:
        return {"task": task_id, "klaar": True}
    return {"task": task_id, "fase": s["name"], "agent": s["agent"], "instructie": s["instructie"], "context": context_for(task, s["name"])}


def complete(task_id: str, stage_name: str, text: str) -> dict:
    task = load(task_id)
    s = current(task)
    if s is None:
        raise SystemExit("Alle fasen zijn al afgerond")
    if s["name"] != stage_name:
        raise SystemExit(f"Volgorde-fout: huidige fase is '{s['name']}', niet '{stage_name}'")
    if not text.strip():
        raise SystemExit("Lege output wordt niet geaccepteerd")
    if stage_name == "oplevering":
        qc = next(x for x in task["stages"] if x["name"] == "kwaliteitscontrole")
        qc_text = (task_dir(task_id) / qc["output"]).read_text(encoding="utf-8") if qc["output"] else ""
        if not APPROVED.search(qc_text):
            raise SystemExit("Kwaliteitspoort: oplevering geblokkeerd, kwaliteitscontrole is niet GOEDGEKEURD")
    idx = STAGE_NAMES.index(stage_name) + 1
    fname = f"{idx:02d}-{stage_name}.md"
    (task_dir(task_id) / fname).write_text(redact(text), encoding="utf-8")
    s["status"], s["output"], s["completed"] = "klaar", fname, now_iso()
    # Afkeuring in kwaliteitscontrole: heropen ontwikkeling + testen (herstel-lus)
    if stage_name == "kwaliteitscontrole" and not APPROVED.search(text):
        for x in task["stages"]:
            if x["name"] in ("ontwikkeling", "testen", "kwaliteitscontrole"):
                x["status"] = "open"
        event(task, "afgekeurd", fase=stage_name)
    else:
        event(task, "fase_klaar", fase=stage_name, agent=s["agent"])
    save(task)
    return {"task": task_id, "afgerond": stage_name, "volgende": (current(task) or {}).get("name")}


def fail(task_id: str, stage_name: str, reason: str) -> dict:
    task = load(task_id)
    rec = {"ts": now_iso(), "task": task_id, "fase": stage_name, "fout": redact(reason)}
    append_jsonl(MEMORY_DIR / "knowledge" / "errors.jsonl", rec)
    event(task, "fout", fase=stage_name, fout=redact(reason))
    save(task)
    return rec


def status(task_id: str | None) -> list | dict:
    if task_id:
        t = load(task_id)
        return {"id": t["id"], "opdracht": t["opdracht"], "fasen": {s["name"]: s["status"] for s in t["stages"]}}
    root = MEMORY_DIR / "tasks"
    out = []
    for p in sorted(root.glob("*/task.json")):
        t = json.loads(p.read_text(encoding="utf-8"))
        if t.get("workflow") != "sequential-delivery":
            continue
        c = current(t)
        out.append({"id": t["id"], "huidige_fase": c["name"] if c else "klaar", "opdracht": t["opdracht"][:80]})
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="Sequentiële agent-pipeline")
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("start"); a.add_argument("opdracht"); a.add_argument("--id"); a.add_argument("--skip", default="")
    b = sub.add_parser("next"); b.add_argument("id")
    c = sub.add_parser("complete"); c.add_argument("id"); c.add_argument("fase"); g = c.add_mutually_exclusive_group(required=True); g.add_argument("--text"); g.add_argument("--file")
    d = sub.add_parser("fail"); d.add_argument("id"); d.add_argument("fase"); d.add_argument("reden")
    e = sub.add_parser("status"); e.add_argument("id", nargs="?")
    args = ap.parse_args()
    if args.cmd == "start":
        res = start(args.opdracht, args.id, args.skip.split(","))
        res = {"id": res["id"], "fasen": [s["name"] for s in res["stages"] if s["status"] == "open"]}
    elif args.cmd == "next":
        res = next_stage(args.id)
    elif args.cmd == "complete":
        text = Path(args.file).read_text(encoding="utf-8") if args.file else args.text
        res = complete(args.id, args.fase, text)
    elif args.cmd == "fail":
        res = fail(args.id, args.fase, args.reden)
    else:
        res = status(args.id)
    print(json.dumps(res, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
