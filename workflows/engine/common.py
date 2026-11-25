"""Gedeelde hulpfuncties voor de multi-agent workflow-engine (alleen standaardbibliotheek)."""
from __future__ import annotations

import json
import os
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(os.environ.get("CLAUDE_PROJECT_DIR") or Path(__file__).resolve().parents[2])
REGISTRY_PATH = ROOT / "workflows" / "registry.json"
MEMORY_DIR = Path(os.environ.get("AGENT_MEMORY_DIR") or ROOT / "memory")
LOG_DIR = Path(os.environ.get("AGENT_LOG_DIR") or ROOT / "logs")
SKILLS_DIR = ROOT / ".claude" / "skills"
AGENTS_DIR = ROOT / ".claude" / "agents"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def normalize(text: str) -> str:
    """Kleine letters, accenten weg, witruimte samengevoegd."""
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", text.lower()).strip()


def contains_keyword(text: str, keyword: str) -> bool:
    """Woordgrens-bewuste match; trefwoorden met spatie aan het eind matchen als voorvoegsel."""
    kw = normalize(keyword) if not keyword.endswith(" ") else normalize(keyword) + " "
    if kw.endswith(" "):
        return kw in text + " "
    # Trefwoorden van 5+ tekens matchen ook verbuigingen/samenstellingen (ontwerp -> ontwerpen, zoekwoord -> zoekwoordonderzoek),
    # korte trefwoorden (ui, api, seo, post) alleen als heel woord.
    tail = r"[a-z]{0,10}" if len(kw) >= 5 else ""
    return re.search(r"(?<![a-z0-9])" + re.escape(kw) + tail + r"(?![a-z0-9])", text) is not None


def load_registry() -> dict:
    return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))


def parse_frontmatter(path: Path) -> tuple[dict, str]:
    """Leest YAML-frontmatter van een .md-bestand. Gebruikt PyYAML als die er is."""
    raw = path.read_text(encoding="utf-8")
    if not raw.startswith("---"):
        return {}, raw
    end = raw.find("\n---", 3)
    if end == -1:
        return {}, raw
    block, body = raw[3:end].strip("\n"), raw[end + 4:].lstrip("\n")
    try:
        import yaml  # type: ignore

        data = yaml.safe_load(block) or {}
    except ImportError:
        data = {}
        for line in block.splitlines():
            if ":" in line and not line.startswith((" ", "-")):
                k, v = line.split(":", 1)
                data[k.strip()] = v.strip().strip('"')
    return data, body


def append_jsonl(path: Path, record: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False) + "\n")


SECRET_PATTERNS = [
    re.compile(r"(sk-[A-Za-z0-9_-]{16,})"),
    re.compile(r"(gh[pousr]_[A-Za-z0-9]{20,})"),
    re.compile(r"(shpat_[A-Za-z0-9]{20,})"),
    re.compile(r"(AKIA[0-9A-Z]{16})"),
    re.compile(r"(?i)((?:api[_-]?key|token|secret|password|wachtwoord)\s*[=:]\s*)(\S+)"),
    re.compile(r"(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})"),
]


def redact(text: str) -> str:
    """Verwijdert sleutels/tokens uit tekst voordat die in logs of geheugen belandt."""
    if not isinstance(text, str):
        text = json.dumps(text, ensure_ascii=False)
    for pat in SECRET_PATTERNS:
        if pat.groups == 2:
            text = pat.sub(lambda m: m.group(1) + "[GEREDIGEERD]", text)
        else:
            text = pat.sub("[GEREDIGEERD]", text)
    return text
