import { describe, expect, it } from "vitest";
import {
  parseMarkdown, readXlsx, renderDocx, renderPdf, renderXlsx, safeFilename, tablesFromMarkdown, toCellValue, toWinAnsi,
} from "@workstudio/document-engine";
import { describeSchedule, nextRunAt, zonedTime } from "@/lib/cowork/schedule";

const MD = `# Offerte kantoorschoonmaak

Beste **meneer Jansen**,

Prijs: € 1.250,00 per maand – inclusief *materiaal*.

## Werkzaamheden

- Stofzuigen en dweilen
- Sanitair reinigen

1. Intake
2. Start

| Ruimte | m² | Prijs |
|---|---|---|
| Kantoor | 300 | € 450,00 |
| Kantine | 40 | 1.234,56 |
`;

describe("document-engine: Markdown", () => {
  it("herkent koppen, alinea's, lijsten en tabellen", () => {
    expect(parseMarkdown(MD).map((b) => b.type)).toEqual(["heading", "paragraph", "paragraph", "heading", "bullets", "numbered", "table"]);
    const t = tablesFromMarkdown(MD);
    expect(t).toHaveLength(1);
    expect(t[0].header).toEqual(["Ruimte", "m²", "Prijs"]);
    expect(t[0].rows[1]).toEqual(["Kantine", "40", "1.234,56"]);
  });
  it("maakt veilige bestandsnamen en PDF-tekst", () => {
    expect(safeFilename("Offerte: Jansen/BV <2026>", "pdf")).toBe("Offerte JansenBV 2026.pdf");
    expect(toWinAnsi("€ één – “test” 😀")).toBe("€ één – “test” ");
  });
  it("zet Nederlandse getallen om voor Excel", () => {
    expect(toCellValue("1.234,56")).toBe(1234.56);
    expect(toCellValue("€ 450,00")).toBe(450);
    expect(toCellValue("12")).toBe(12);
    expect(toCellValue("0612345678")).toBe("0612345678");
    expect(toCellValue("Kantoor")).toBe("Kantoor");
  });
});

describe("document-engine: bestanden", () => {
  it("Word-bestand is leesbaar en bevat de inhoud", async () => {
    const buf = await renderDocx(MD, { title: "Offerte", organization: "Clean Schoonmaakbedrijf B.V." });
    expect(buf.subarray(0, 2).toString()).toBe("PK");
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: buf });
    expect(value).toContain("Offerte kantoorschoonmaak");
    expect(value).toContain("Sanitair reinigen");
    expect(value).toContain("Kantine");
  });
  it("PDF is geldig en bevat de tekst, ook met euroteken", async () => {
    const pdf = await renderPdf(MD, { title: "Offerte", organization: "Clean", footerNote: "Concept" });
    expect(Buffer.from(pdf.subarray(0, 5)).toString()).toBe("%PDF-");
    const { extractText, getDocumentProxy } = await import("unpdf");
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(pdf)), { mergePages: true });
    expect(text).toContain("Werkzaamheden");
    expect(text).toContain("€ 1.250,00");
    expect(text).toContain("Pagina 1 van 1");
  });
  it("PDF met veel tekst loopt door over meerdere pagina's", async () => {
    const long = Array.from({ length: 120 }, (_, i) => `Alinea ${i + 1}: ${"schoon ".repeat(30)}`).join("\n\n");
    const pdf = await renderPdf(long, { title: "Lang" });
    const { getDocumentProxy } = await import("unpdf");
    expect((await getDocumentProxy(new Uint8Array(pdf))).numPages).toBeGreaterThan(3);
  });
  it("Excel heen en terug: kolommen, getallen en bladnamen", async () => {
    const buf = await renderXlsx([{ name: "Uren: week/1", columns: ["Naam", "Uren"], rows: [["Fatima", "7,5"], ["Johan", 8]] }], { title: "Uren" });
    const sheets = await readXlsx(buf);
    expect(sheets[0].name).toBe("Uren  week 1");
    expect(sheets[0].columns).toEqual(["Naam", "Uren"]);
    expect(sheets[0].rows).toEqual([["Fatima", 7.5], ["Johan", 8]]);
  });
});

describe("taakplanner: volgende uitvoering", () => {
  const tz = "Europe/Amsterdam";
  it("rekent met Nederlandse tijd, ook rond zomertijd", () => {
    // 28 maart 2026 is wintertijd (UTC+1), 29 maart zomertijd (UTC+2).
    expect(zonedTime(2026, 3, 28, 8, 30, tz).toISOString()).toBe("2026-03-28T07:30:00.000Z");
    expect(zonedTime(2026, 3, 29, 8, 30, tz).toISOString()).toBe("2026-03-29T06:30:00.000Z");
    const n = nextRunAt({ frequency: "daily", timeOfDay: "08:30", timezone: tz }, new Date("2026-03-28T08:00:00Z"));
    expect(n?.toISOString()).toBe("2026-03-29T06:30:00.000Z");
  });
  it("dagelijks: vandaag als het tijdstip nog moet komen, anders morgen", () => {
    expect(nextRunAt({ frequency: "daily", timeOfDay: "09:00", timezone: tz }, new Date("2026-11-24T07:00:00Z"))?.toISOString()).toBe("2026-11-24T08:00:00.000Z");
    expect(nextRunAt({ frequency: "daily", timeOfDay: "09:00", timezone: tz }, new Date("2026-11-24T08:00:00Z"))?.toISOString()).toBe("2026-11-25T08:00:00.000Z");
  });
  it("werkdagen slaan het weekend over; wekelijks op de gekozen dag", () => {
    // vrijdag 27 november 2026, 18:00
    expect(nextRunAt({ frequency: "weekdays", timeOfDay: "07:45", timezone: tz }, new Date("2026-11-27T17:00:00Z"))?.toISOString()).toBe("2026-11-30T06:45:00.000Z");
    expect(nextRunAt({ frequency: "weekly", timeOfDay: "08:15", weekday: 3, timezone: tz }, new Date("2026-11-24T10:00:00Z"))?.toISOString()).toBe("2026-11-25T07:15:00.000Z");
  });
  it("maandelijks op dag 31 valt in korte maanden op de laatste dag", () => {
    expect(nextRunAt({ frequency: "monthly", timeOfDay: "10:00", dayOfMonth: 31, timezone: tz }, new Date("2027-02-01T00:00:00Z"))?.toISOString()).toBe("2027-02-28T09:00:00.000Z");
  });
  it("eenmalig: alleen als het tijdstip nog in de toekomst ligt", () => {
    const at = new Date("2026-12-01T09:00:00Z");
    expect(nextRunAt({ frequency: "once", timeOfDay: "00:00", runOnceAt: at }, new Date("2026-11-30T00:00:00Z"))).toEqual(at);
    expect(nextRunAt({ frequency: "once", timeOfDay: "00:00", runOnceAt: at }, new Date("2026-12-02T00:00:00Z"))).toBeNull();
  });
  it("beschrijft de planning in het Nederlands", () => {
    expect(describeSchedule({ frequency: "weekly", timeOfDay: "08:15", weekday: 1 })).toBe("Elke maandag om 08:15");
    expect(describeSchedule({ frequency: "weekdays", timeOfDay: "07:45" })).toBe("Elke werkdag om 07:45");
  });
});
