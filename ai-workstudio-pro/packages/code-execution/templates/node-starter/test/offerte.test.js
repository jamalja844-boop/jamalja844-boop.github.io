import { test } from "node:test";
import assert from "node:assert/strict";
import { berekenOfferte, rond } from "../src/offerte.js";

test("rondt af op centen", () => {
  assert.equal(rond(10.005), 10.01);
  assert.equal(rond(3.14159), 3.14);
});

test("berekent een jaarofferte met btw", () => {
  const o = berekenOfferte({ m2: 300, tariefPerM2: 0.5, keerPerWeek: 2 });
  assert.equal(o.perBeurt, 150);
  assert.equal(o.exclBtw, 15600);
  assert.equal(o.btw, 3276);
  assert.equal(o.inclBtw, 18876);
});

test("weigert ongeldige invoer", () => {
  assert.throws(() => berekenOfferte({ m2: 0, tariefPerM2: 1, keerPerWeek: 1 }), /Oppervlakte/);
});
