import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  DecryptionError,
  encryptSecret,
  EncryptionConfigError,
  isEncryptionConfigured,
  secretHint,
} from "../../app/lib/security/crypto.server";
import { checkCsvUpload } from "../../app/lib/security/upload";
import { mergeRates, parseEcbXml } from "../../app/lib/pricing/exchange-rates";

const key = randomBytes(32).toString("base64");
const otherKey = randomBytes(32).toString("base64");

describe("versleuteling van API-sleutels", () => {
  it("versleutelt en ontsleutelt; de platte tekst staat niet in de opgeslagen waarde", () => {
    const secret = "test-api-sleutel-zeergeheim-1234567890";
    const token = encryptSecret(secret, "shop1:ai.anthropic.apiKey", key);
    expect(token.startsWith("nn1:")).toBe(true);
    expect(token).not.toContain("zeergeheim");
    expect(decryptSecret(token, "shop1:ai.anthropic.apiKey", key)).toBe(secret);
  });

  it("gebruikt elke keer een nieuwe IV", () => {
    expect(encryptSecret("abc", "a", key)).not.toBe(encryptSecret("abc", "a", key));
  });

  it("weigert een andere sleutel, gewijzigde gegevens of een andere winkel (AAD)", () => {
    const token = encryptSecret("geheim", "shop1:key", key);
    expect(() => decryptSecret(token, "shop1:key", otherKey)).toThrow(DecryptionError);
    expect(() => decryptSecret(token, "shop2:key", key)).toThrow(DecryptionError);
    const parts = token.split(":");
    parts[3] = Buffer.from("knoeien").toString("base64url");
    expect(() => decryptSecret(parts.join(":"), "shop1:key", key)).toThrow(DecryptionError);
  });

  it("vereist een geldige sleutel van 32 bytes", () => {
    expect(() => encryptSecret("x", "a", "")).toThrow(EncryptionConfigError);
    expect(() => encryptSecret("x", "a", Buffer.from("te-kort").toString("base64"))).toThrow(EncryptionConfigError);
    expect(isEncryptionConfigured(key)).toBe(true);
    expect(isEncryptionConfigured("")).toBe(false);
  });

  it("toont alleen een korte hint", () => {
    expect(secretHint("sk-1234567890abcd")).toBe("…abcd");
    expect(secretHint("kort")).toBe("…");
  });
});

describe("uploadcontrole", () => {
  const enc = (s: string) => new TextEncoder().encode(s);

  it("accepteert een geldig CSV-bestand", () => {
    const r = checkCsvUpload({ name: "catalogus.CSV", size: 10, type: "text/csv" }, enc("a,b\n1,2"));
    expect(r).toMatchObject({ ok: true, encoding: "utf-8", text: "a,b\n1,2" });
  });

  it("weigert verkeerde extensies, types, lege, te grote en binaire bestanden", () => {
    expect(checkCsvUpload({ name: "x.exe", size: 3, type: "text/csv" }, enc("abc")).ok).toBe(false);
    expect(checkCsvUpload({ name: "x.csv", size: 3, type: "application/x-msdownload" }, enc("abc")).ok).toBe(false);
    expect(checkCsvUpload({ name: "x.csv", size: 0, type: "text/csv" }, new Uint8Array()).ok).toBe(false);
    expect(checkCsvUpload({ name: "x.csv", size: 20, type: "text/csv" }, enc("a".repeat(20)), { maxBytes: 10 }).ok).toBe(false);
    expect(checkCsvUpload({ name: "x.csv", size: 3, type: "text/csv" }, new Uint8Array([97, 0, 98])).ok).toBe(false);
  });

  it("valt terug op Windows-1252 (Excel)", () => {
    const bytes = new Uint8Array([0x63, 0x61, 0x66, 0xe9]); // "café" in Windows-1252
    const r = checkCsvUpload({ name: "x.csv", size: 4, type: "" }, bytes);
    expect(r).toMatchObject({ ok: true, encoding: "windows-1252", text: "café" });
  });
});

describe("ECB-wisselkoersen", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <Cube><Cube time='2026-11-06'>
    <Cube currency='USD' rate='1.0812'/><Cube currency='CNY' rate='7.7890'/><Cube currency='GBP' rate='0.8401'/>
  </Cube></Cube></gesmes:Envelope>`;

  it("leest datum en koersen", () => {
    expect(parseEcbXml(xml)).toEqual({ date: "2026-11-06", rates: { USD: 1.0812, CNY: 7.789, GBP: 0.8401 } });
  });

  it("weigert een onverwacht formaat", () => {
    expect(() => parseEcbXml("<html>storing</html>")).toThrow();
  });

  it("handmatige koersen hebben voorrang", () => {
    const merged = mergeRates(parseEcbXml(xml), { usd: 1.1, XX: 3, CNY: -1 });
    expect(merged.source).toBe("ECB+MANUAL");
    expect(merged.rates).toMatchObject({ USD: 1.1, CNY: 7.789 });
    expect(merged.rates).not.toHaveProperty("XX");
  });
});
