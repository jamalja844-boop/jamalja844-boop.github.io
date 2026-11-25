#!/usr/bin/env python3
"""Parallel-agent engine: taakbord voor fan-out/fan-in met conflict- en dubbelwerkpreventie.

Commando's:
    taskboard.py plan BOARD plan.json        # [{"id","titel","agent","paden":[...]}]
    taskboard.py claim BOARD TAAK AGENT      # claimt taak + bestandsrechten (lock)
    taskboard.py done BOARD TAAK (--text "..." | --file pad)
    taskboard.py fail BOARD TAAK "reden"
    taskboard.py merge BOARD                 # combineert alle resultaten in merged.md
    taskboard.py status BOARD

Conflictregels:
  * Twee taken met (genormaliseerd) dezelfde titel of dezelfde agent+paden -> dubbel, geweigerd.
  * Paden overlappen (gelijk of map/bestand-in-map) tussen taken -> geweigerd bij plannen.
  * Claimen kan maar door één agent; tweede claim faalt.
  * Bestandsbewerkingen gebeuren onder een exclusieve bestandslock (fcntl), dus veilig bij gelijktijdige agents.
"""
from __future__ import annotations

import argparse
import contextlib
import fcntl
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import LOG_DIR, MEMORY_DIR, append_jsonl, normalize, now_iso, redact  # noqa: E402


class Conflict(Exception):
    pass


def board_dir(board: str) -> Path:
    return MEMORY_DIR / "tasks" / board


@contextlib.contextmanager
def locked(board: str):
    d = board_dir(board)
    d.mkdir(parents=True, exist_ok=True)
    lock = (d / ".lock").open("w")
    fcntl.flock(lock, fcntl.LOCK_EX)
    try:
        p = d / "board.json"
        data = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {"id": board, "workflow": "parallel-fanout", "tasks": {}}
        yield data
        p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    finally:
        fcntl.flock(lock, fcntl.LOCK_UN)
        lock.close()


def _overlap(a: str, b: str) -> bool:
    a, b = a.rstrip("/"), b.rstrip("/")
    return a == b or a.startswith(b + "/") or b.startswith(a + "/")


def plan(board: str, items: list[dict]) -> dict:
    with locked(board) as data:
        existing = list(data["tasks"].values())
        for it in items:
            for k in ("id", "titel", "agent"):
                if not it.get(k):
                    raise Conflict(f"Taak mist veld '{k}': {it}")
            if it["id"] in data["tasks"]:
                raise Conflict(f"Dubbel taak-id: {it['id']}")
            for other in existing:
                if normalize(other["titel"]) == normalize(it["titel"]):
                    raise Conflict(f"Dubbel werk: '{it['titel']}' bestaat al als {other['id']}")
                for p in it.get("paden", []):
                    for q in other.get("paden", []):
                        if _overlap(p, q):
                            raise Conflict(f"Padconflict: {it['id']}:{p} overlapt met {other['id']}:{q}")
            rec = {"id": it["id"], "titel": it["titel"], "agent": it["agent"], "paden": it.get("paden", []), "afhankelijk_van": it.get("afhankelijk_van", []), "status": "open", "claimed_by": None, "output": None}
            data["tasks"][it["id"]] = rec
            existing.append(rec)
        append_jsonl(LOG_DIR / "taskboard.jsonl", {"ts": now_iso(), "board": board, "event": "plan", "tasks": [i["id"] for i in items]})
        return {"board": board, "taken": list(data["tasks"])}


def claim(board: str, task: str, agent: str) -> dict:
    with locked(board) as data:
        t = data["tasks"].get(task)
        if not t:
            raise Conflict(f"Onbekende taak {task}")
        if t["status"] != "open":
            raise Conflict(f"Taak {task} is al {t['status']} door {t['claimed_by']}")
        open_deps = [d for d in t["afhankelijk_van"] if data["tasks"].get(d, {}).get("status") != "klaar"]
        if open_deps:
            raise Conflict(f"Taak {task} wacht op {open_deps}")
        t.update(status="bezig", claimed_by=agent, claimed_at=now_iso())
        append_jsonl(LOG_DIR / "taskboard.jsonl", {"ts": now_iso(), "board": board, "event": "claim", "task": task, "agent": agent})
        return {"claimed": task, "agent": agent, "paden": t["paden"]}


def done(board: str, task: str, text: str) -> dict:
    if not text.strip():
        raise Conflict("Lege output")
    with locked(board) as data:
        t = data["tasks"][task]
        if t["status"] != "bezig":
            raise Conflict(f"Taak {task} is niet geclaimd (status {t['status']})")
        fname = f"result-{task}.md"
        (board_dir(board) / fname).write_text(redact(text), encoding="utf-8")
        t.update(status="klaar", output=fname, done_at=now_iso())
        append_jsonl(LOG_DIR / "taskboard.jsonl", {"ts": now_iso(), "board": board, "event": "done", "task": task})
        return {"klaar": task, "open": [k for k, v in data["tasks"].items() if v["status"] != "klaar"]}


def fail(board: str, task: str, reason: str) -> dict:
    with locked(board) as data:
        t = data["tasks"][task]
        t.update(status="open", claimed_by=None, laatste_fout=redact(reason))
        rec = {"ts": now_iso(), "board": board, "task": task, "fout": redact(reason)}
        append_jsonl(MEMORY_DIR / "knowledge" / "errors.jsonl", rec)
        return rec


def merge(board: str) -> dict:
    with locked(board) as data:
        pending = [k for k, v in data["tasks"].items() if v["status"] != "klaar"]
        if pending:
            raise Conflict(f"Kan niet samenvoegen, nog open: {pending}")
        parts = [f"# Samengevoegd resultaat - {board}\n"]
        for t in data["tasks"].values():
            body = (board_dir(board) / t["output"]).read_text(encoding="utf-8").strip()
            parts.append(f"## {t['titel']} ({t['agent']})\n\n{body}\n")
        out = board_dir(board) / "merged.md"
        out.write_text("\n".join(parts), encoding="utf-8")
        data["merged"] = now_iso()
        return {"merged": str(out.relative_to(MEMORY_DIR.parent)) if MEMORY_DIR.parent in out.parents else str(out), "taken": len(data["tasks"])}


def status(board: str) -> dict:
    with locked(board) as data:
        return {k: {"status": v["status"], "agent": v["agent"], "claimed_by": v["claimed_by"]} for k, v in data["tasks"].items()}


def main() -> int:
    ap = argparse.ArgumentParser(description="Parallel taakbord")
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("plan"); a.add_argument("board"); a.add_argument("planfile")
    b = sub.add_parser("claim"); b.add_argument("board"); b.add_argument("task"); b.add_argument("agent")
    c = sub.add_parser("done"); c.add_argument("board"); c.add_argument("task"); g = c.add_mutually_exclusive_group(required=True); g.add_argument("--text"); g.add_argument("--file")
    d = sub.add_parser("fail"); d.add_argument("board"); d.add_argument("task"); d.add_argument("reden")
    e = sub.add_parser("merge"); e.add_argument("board")
    f = sub.add_parser("status"); f.add_argument("board")
    args = ap.parse_args()
    try:
        if args.cmd == "plan":
            res = plan(args.board, json.loads(Path(args.planfile).read_text(encoding="utf-8")))
        elif args.cmd == "claim":
            res = claim(args.board, args.task, args.agent)
        elif args.cmd == "done":
            res = done(args.board, args.task, Path(args.file).read_text(encoding="utf-8") if args.file else args.text)
        elif args.cmd == "fail":
            res = fail(args.board, args.task, args.reden)
        elif args.cmd == "merge":
            res = merge(args.board)
        else:
            res = status(args.board)
    except Conflict as exc:
        print(json.dumps({"conflict": str(exc)}, ensure_ascii=False))
        return 3
    print(json.dumps(res, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
