/**
 * Veilige rekenmachine (recursive descent), zonder eval.
 * Ondersteunt: + - * / ^ ( ), unaire min, decimale komma/punt en postfix % (= /100).
 */
export function calculate(expression: string): number {
  const src = expression.replace(/,/g, ".").replace(/\s+/g, "");
  if (!src || src.length > 300) throw new Error("Lege of te lange expressie");
  if (!/^[0-9.+\-*/^()%]+$/.test(src)) throw new Error("Alleen getallen en + - * / ^ ( ) % zijn toegestaan");
  let pos = 0;

  const peek = () => src[pos];
  const eat = (ch: string) => {
    if (src[pos] === ch) {
      pos++;
      return true;
    }
    return false;
  };

  function number(): number {
    const start = pos;
    while (pos < src.length && /[0-9.]/.test(src[pos])) pos++;
    const s = src.slice(start, pos);
    if (!s || (s.match(/\./g)?.length ?? 0) > 1) throw new Error(`Ongeldig getal bij positie ${start + 1}`);
    return parseFloat(s);
  }

  function primary(): number {
    if (eat("(")) {
      const v = expr();
      if (!eat(")")) throw new Error("Ontbrekend sluithaakje");
      return v;
    }
    if (eat("-")) return -primary();
    if (eat("+")) return primary();
    return number();
  }

  function postfix(): number {
    let v = primary();
    while (eat("%")) v = v / 100;
    return v;
  }

  function power(): number {
    const base = postfix();
    if (eat("^")) return Math.pow(base, power());
    return base;
  }

  function term(): number {
    let v = power();
    for (;;) {
      if (eat("*")) v *= power();
      else if (eat("/")) {
        const d = power();
        if (d === 0) throw new Error("Delen door nul");
        v /= d;
      } else return v;
    }
  }

  function expr(): number {
    let v = term();
    for (;;) {
      if (eat("+")) v += term();
      else if (eat("-")) v -= term();
      else return v;
    }
  }

  const result = expr();
  if (pos !== src.length) throw new Error(`Onverwacht teken "${peek()}" bij positie ${pos + 1}`);
  if (!Number.isFinite(result)) throw new Error("Resultaat is geen eindig getal");
  return Math.round(result * 1e10) / 1e10;
}
