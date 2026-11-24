/**
 * Offertecalculator voor schoonmaakwerkzaamheden.
 * Alle bedragen in euro's, afgerond op centen.
 */

export const BTW = 0.21;

/** Afronden op 2 decimalen (centen). */
export function rond(bedrag) {
  return Math.round(bedrag * 100) / 100;
}

/**
 * Berekent een offerte.
 * @param {{ m2: number, tariefPerM2: number, keerPerWeek: number, weken?: number }} invoer
 */
export function berekenOfferte({ m2, tariefPerM2, keerPerWeek, weken = 52 }) {
  if (!(m2 > 0)) throw new Error("Oppervlakte moet groter dan 0 zijn");
  if (!(tariefPerM2 > 0)) throw new Error("Tarief moet groter dan 0 zijn");
  if (!(keerPerWeek > 0)) throw new Error("Frequentie moet groter dan 0 zijn");
  const perBeurt = rond(m2 * tariefPerM2);
  const exclBtw = rond(perBeurt * keerPerWeek * weken);
  const btw = rond(exclBtw * BTW);
  return { perBeurt, exclBtw, btw, inclBtw: rond(exclBtw + btw) };
}
