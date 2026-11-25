#!/usr/bin/env python3
"""Leadlijst-hulpmiddel: validate | dedupe. CSV met ';' (Excel-NL)."""
import csv, re, sys, argparse
from urllib.parse import urlparse
COLS = ["bedrijfsnaam","website","vestigingsplaats","branche","zakelijk_email","zakelijk_telefoon",
        "bron_url","controledatum","mogelijke_behoefte","prioriteit","opmerkingen"]
GENERIC = {"info","contact","receptie","administratie","kantoor","office","hallo","hello","mail",
           "sales","verkoop","service","klantenservice","secretariaat","praktijk","reserveringen","algemeen"}
def read(p):
    with open(p, encoding="utf-8-sig", newline="") as f: return list(csv.DictReader(f, delimiter=";"))
def domain(u):
    u = (u or "").strip().lower()
    if not u: return ""
    if "://" not in u: u = "https://" + u
    return urlparse(u).netloc.removeprefix("www.")
def norm(s): return re.sub(r"[^a-z0-9]", "", (s or "").lower().replace("b.v.","").replace("bv",""))
def validate(rows):
    problems = []
    for i, r in enumerate(rows, start=2):
        for c in ["bedrijfsnaam","vestigingsplaats","branche","bron_url","controledatum"]:
            if not (r.get(c) or "").strip(): problems.append(f"r{i}: {c} ontbreekt")
        if r.get("controledatum") and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", r["controledatum"]): problems.append(f"r{i}: datum niet JJJJ-MM-DD")
        if r.get("bron_url") and not r["bron_url"].startswith(("http://","https://")): problems.append(f"r{i}: bron_url ongeldig")
        e = (r.get("zakelijk_email") or "").strip().lower()
        if e:
            if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[a-z]{2,}", e): problems.append(f"r{i}: e-mail ongeldig")
            elif e.split("@")[0] not in GENERIC: problems.append(f"r{i}: mogelijk persoonsgebonden e-mail '{e}' (AVG) — verwijderen of motiveren")
        t = re.sub(r"[\s\-()]", "", r.get("zakelijk_telefoon") or "")
        if t and not re.fullmatch(r"(\+31|0031|0)[1-9]\d{8}", t): problems.append(f"r{i}: telefoon geen geldig NL-nummer")
        if t and re.fullmatch(r"(\+31|0031|0)6\d{8}", t): problems.append(f"r{i}: mobiel nummer — controleer of het zakelijk gepubliceerd is")
    return problems
def dedupe(rows):
    seen, out = set(), []
    for r in rows:
        k = domain(r.get("website")) or (norm(r.get("bedrijfsnaam")) + "|" + norm(r.get("vestigingsplaats")))
        if k in seen: continue
        seen.add(k); out.append(r)
    return out
if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("cmd", choices=["validate","dedupe"]); ap.add_argument("csv"); ap.add_argument("-o")
    a = ap.parse_args(); rows = read(a.csv)
    if a.cmd == "validate":
        p = validate(rows); print("\n".join(p) or "OK"); print(f"{len(rows)} rijen, {len(p)} meldingen"); sys.exit(1 if p else 0)
    out = dedupe(rows); dst = a.o or a.csv
    with open(dst, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLS, delimiter=";", extrasaction="ignore"); w.writeheader(); w.writerows(out)
    print(f"{len(rows)} -> {len(out)} rijen ({len(rows)-len(out)} duplicaten verwijderd) -> {dst}")
