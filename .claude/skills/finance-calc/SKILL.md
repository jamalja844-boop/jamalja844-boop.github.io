---
name: finance-calc
description: "Exacte financiële berekeningen voor administratie: BTW (21%, 9%, 0%), excl./incl., offertes, facturen, marges, opslag, kostprijs, begroting en cashflow, met Decimal-afronding via workflows/engine/calc.py. Gebruik bij elke berekening met geld."
allowed-tools: Bash(python3 workflows/engine/calc.py *)
---
# Financiële berekeningen

**Nooit uit het hoofd rekenen.** Altijd een script, en de uitvoer als bewijs tonen.

```bash
python3 workflows/engine/calc.py btw 100 --btw 21                  # excl -> btw + incl
python3 workflows/engine/calc.py excl 121 --btw 21                 # incl -> excl
python3 workflows/engine/calc.py marge --kostprijs 12.50 --verkoopprijs 29.95 --btw 21
python3 workflows/engine/calc.py offerte --regel "Omschrijving|aantal|prijs" --btw 21 --korting 10
```

Voor andere berekeningen: Python met `from decimal import Decimal, ROUND_HALF_UP`; geldbedragen als string invoeren (`Decimal("12.50")`), afronden met `.quantize(Decimal("0.01"), ROUND_HALF_UP)`.

## Definities
- Marge % = (verkoopprijs excl. - kostprijs) / verkoopprijs excl. x 100
- Opslag % = (verkoopprijs excl. - kostprijs) / kostprijs x 100
- BTW-tarieven NL: 21% algemeen, 9% verlaagd (o.a. voedsel, boeken), 0%/verlegd in specifieke gevallen -> `[CONTROLEER MET BOEKHOUDER]`.

## Rapportage
Invoer -> formule -> uitkomst, bedragen als `€ 1.234,56`. Betalingen worden nooit uitgevoerd, alleen voorbereid.
