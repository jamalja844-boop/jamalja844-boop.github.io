#!/usr/bin/env python3
"""Exacte geldberekeningen voor Sales/Finance (Decimal, afronding op centen, NL BTW).

Gebruik:
    calc.py offerte --regel "Schoonmaak kantoor|10|35.00" --regel "Materiaal|1|25" [--btw 21] [--korting 5]
    calc.py btw 100 --btw 21            # bedrag excl. -> BTW + incl.
    calc.py excl 121 --btw 21           # bedrag incl. -> excl.
    calc.py marge --kostprijs 12.50 --verkoopprijs 29.95 [--btw 21]   # verkoopprijs incl. BTW
Output: JSON met alle tussenstappen, zodat QA kan narekenen.
"""
from __future__ import annotations

import argparse
import json
import sys
from decimal import ROUND_HALF_UP, Decimal

CENT = Decimal("0.01")


def money(x) -> Decimal:
    return Decimal(str(x).replace(",", ".")).quantize(CENT, rounding=ROUND_HALF_UP)


def fmt(d: Decimal) -> str:
    s = f"{d:,.2f}"
    return "€ " + s.replace(",", "X").replace(".", ",").replace("X", ".")


def offerte(regels: list[str], btw: Decimal, korting: Decimal = Decimal(0)) -> dict:
    lines, subtotal = [], Decimal(0)
    for r in regels:
        oms, aantal, prijs = [p.strip() for p in r.split("|")]
        aantal_d, prijs_d = Decimal(aantal.replace(",", ".")), money(prijs)
        totaal = (aantal_d * prijs_d).quantize(CENT, rounding=ROUND_HALF_UP)
        subtotal += totaal
        lines.append({"omschrijving": oms, "aantal": str(aantal_d), "prijs_excl": str(prijs_d), "totaal_excl": str(totaal)})
    korting_bedrag = (subtotal * korting / 100).quantize(CENT, rounding=ROUND_HALF_UP)
    excl = subtotal - korting_bedrag
    btw_bedrag = (excl * btw / 100).quantize(CENT, rounding=ROUND_HALF_UP)
    incl = excl + btw_bedrag
    return {"regels": lines, "subtotaal_excl": str(subtotal), "korting_pct": str(korting), "korting": str(korting_bedrag), "totaal_excl": str(excl), "btw_pct": str(btw), "btw": str(btw_bedrag), "totaal_incl": str(incl), "weergave": {"excl": fmt(excl), "btw": fmt(btw_bedrag), "incl": fmt(incl)}}


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    o = sub.add_parser("offerte"); o.add_argument("--regel", action="append", required=True); o.add_argument("--btw", default="21"); o.add_argument("--korting", default="0")
    b = sub.add_parser("btw"); b.add_argument("bedrag"); b.add_argument("--btw", default="21")
    e = sub.add_parser("excl"); e.add_argument("bedrag"); e.add_argument("--btw", default="21")
    m = sub.add_parser("marge"); m.add_argument("--kostprijs", required=True); m.add_argument("--verkoopprijs", required=True); m.add_argument("--btw", default="21")
    a = ap.parse_args()
    btw = Decimal(a.btw)
    if a.cmd == "offerte":
        res = offerte(a.regel, btw, Decimal(a.korting))
    elif a.cmd == "btw":
        excl = money(a.bedrag); v = (excl * btw / 100).quantize(CENT, rounding=ROUND_HALF_UP)
        res = {"excl": str(excl), "btw": str(v), "incl": str(excl + v)}
    elif a.cmd == "excl":
        incl = money(a.bedrag); excl = (incl / (1 + btw / 100)).quantize(CENT, rounding=ROUND_HALF_UP)
        res = {"incl": str(incl), "excl": str(excl), "btw": str(incl - excl)}
    else:
        kost = money(a.kostprijs); vp_incl = money(a.verkoopprijs)
        vp_excl = (vp_incl / (1 + btw / 100)).quantize(CENT, rounding=ROUND_HALF_UP)
        winst = vp_excl - kost
        res = {"verkoopprijs_incl": str(vp_incl), "verkoopprijs_excl": str(vp_excl), "kostprijs": str(kost), "brutowinst": str(winst), "marge_pct": str((winst / vp_excl * 100).quantize(CENT, rounding=ROUND_HALF_UP)) if vp_excl else "0", "opslag_pct": str((winst / kost * 100).quantize(CENT, rounding=ROUND_HALF_UP)) if kost else "n.v.t."}
    print(json.dumps(res, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
