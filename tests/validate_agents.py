#!/usr/bin/env python3
"""Valideert agents, skills, workflows, settings en verwijzingen. Exitcode 1 bij fouten."""
import json, re, sys, pathlib, yaml
ROOT = pathlib.Path(__file__).resolve().parent.parent
errors, ok = [], []
def err(m): errors.append(m)
def front(path):
    t = path.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", t, re.S)
    if not m: err(f"{path}: geen frontmatter"); return {}, ""
    return yaml.safe_load(m.group(1)) or {}, m.group(2)

EXPECTED = ["orchestrator","social-media-manager","website-designer","competitor-tracker",
            "lead-finder","campaign-manager","content-strategist","automation-manager"]
KNOWN_FIELDS = {"name","description","tools","disallowedTools","model","permissionMode","maxTurns",
  "skills","mcpServers","hooks","memory","background","effort","isolation","color","initialPrompt",
  "omitClaudeMd","autoCompactWindow","experimental"}
skills_dir = ROOT/".claude/skills"
skill_names = set()
for sk in skills_dir.glob("*/SKILL.md"):
    fm, body = front(sk)
    if fm.get("name") != sk.parent.name: err(f"{sk}: name '{fm.get('name')}' != map '{sk.parent.name}'")
    if not fm.get("description") or len(fm["description"]) > 1024: err(f"{sk}: description ontbreekt/te lang")
    if len(body.strip()) < 100: err(f"{sk}: inhoud te kort")
    skill_names.add(fm.get("name"))
ok.append(f"{len(skill_names)} skills gevalideerd")

agents = {}
for a in (ROOT/".claude/agents").glob("*.md"):
    fm, body = front(a)
    n = fm.get("name"); agents[n] = (fm, body)
    if a.stem != n: err(f"{a}: bestandsnaam != name")
    unknown = set(fm) - KNOWN_FIELDS
    if unknown: err(f"{a}: onbekende velden {unknown}")
    if not fm.get("description"): err(f"{a}: description ontbreekt")
    tools = fm.get("tools", "")
    tl = [t.strip() for t in (tools.split(",") if isinstance(tools, str) else tools)]
    if not tl or tl == [""]: err(f"{a}: geen expliciete tools (least privilege vereist)")
    for t in tl:
        if not re.fullmatch(r"[A-Za-z][\w-]*(\*)?|mcp__[\w-]+__[\w*-]+", t): err(f"{a}: ongeldige toolnaam '{t}'")
    if n != "orchestrator" and "Agent" in tl: err(f"{a}: subagent mag geen Agent-tool hebben")
    for s in fm.get("skills", []) or []:
        if s not in skill_names: err(f"{a}: skill '{s}' bestaat niet")
    for ref in re.findall(r"skill `([\w-]+)`", body):
        if ref not in skill_names and ref != "xlsx": err(f"{a}: verwijst naar onbekende skill '{ref}'")
    if len(body.strip()) < 400: err(f"{a}: systeemprompt te kort")
missing = set(EXPECTED) - set(agents)
if missing: err(f"ontbrekende agents: {missing}")
else: ok.append("8 agents aanwezig en geldig")

# Orchestrator moet alle specialisten kennen
orch = agents.get("orchestrator", ({}, ""))[1]
for e in EXPECTED[1:]:
    if e not in orch: err(f"orchestrator noemt '{e}' niet")
# Veiligheidsregels: elke agent met verzend/publicatie-tools noemt goedkeuring
for n, (fm, body) in agents.items():
    if "goedkeuring" not in body.lower() and "akkoord" not in body.lower(): err(f"{n}: geen goedkeuringsregel")

# Workflows
agent_set = set(EXPECTED)
for w in (ROOT/"workflows").glob("*.yaml"):
    d = yaml.safe_load(w.read_text())
    for k in ["id","naam","doel","eigenaar","status","trigger","voorwaarden","stappen","foutafhandeling","logging"]:
        if k not in d: err(f"{w.name}: veld '{k}' ontbreekt")
    if d.get("id") != w.stem: err(f"{w.name}: id != bestandsnaam")
    if d.get("status") not in {"actief","ontwerp","wacht-op-koppeling"}: err(f"{w.name}: ongeldige status")
    ids = {s["id"] for s in d.get("stappen", [])}
    for s in d.get("stappen", []):
        if s.get("agent") not in agent_set: err(f"{w.name}/{s.get('id')}: onbekende agent {s.get('agent')}")
        if "goedkeuring_vereist" not in s: err(f"{w.name}/{s['id']}: goedkeuring_vereist ontbreekt")
        if re.search(r"verzend|versturen|publiceer|refund|annuler|\bfulfil|inplannen|createScheduledPost", s.get("actie",""), re.I) and not s.get("goedkeuring_vereist"):
            err(f"{w.name}/{s['id']}: externe actie zonder goedkeuring")
        for dep in s.get("hangt_af_van", []):
            if dep not in ids: err(f"{w.name}/{s['id']}: afhankelijkheid {dep} bestaat niet")
ok.append(f"{len(list((ROOT/'workflows').glob('*.yaml')))} workflows gevalideerd")

# Settings
st = json.loads((ROOT/".claude/settings.json").read_text())
if not st.get("enabledPlugins"): err("settings: bestaande plugins verdwenen")
ask = st.get("permissions", {}).get("ask", [])
for must in ["mcp__Metricool_Social_Media_Management__createScheduledPost","mcp__Shopify__theme_publish",
             "mcp__Shopify__graphql_mutation","mcp__Google_Drive__trash_file","Bash(git push *)"]:
    if must not in ask: err(f"settings: '{must}' niet in ask-lijst")
json.loads((ROOT/".mcp.json").read_text())
ok.append("settings.json en .mcp.json geldig")

# Geen secrets
pat = re.compile(r"(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|shpat_[a-f0-9]{20,}|ghp_[A-Za-z0-9]{30,}|xox[bp]-[A-Za-z0-9-]{20,})")
for f in ROOT.rglob("*"):
    if f.is_file() and ".git" not in f.parts and f.suffix in {".md",".json",".yaml",".py",".csv",".html"}:
        if pat.search(f.read_text(errors="ignore")): err(f"mogelijk geheim in {f}")
ok.append("geen geheimen gevonden")

# Verplichte mappen
for d in ["workflows","reports","memory","tests","docs",".claude/skills"]:
    if not (ROOT/d).is_dir(): err(f"map {d} ontbreekt")

for o in ok: print("✅", o)
for e in errors: print("❌", e)
print(f"\nResultaat: {'GESLAAGD' if not errors else f'{len(errors)} FOUT(EN)'}")
sys.exit(1 if errors else 0)
