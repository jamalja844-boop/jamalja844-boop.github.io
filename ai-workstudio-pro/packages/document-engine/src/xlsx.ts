import ExcelJS from "exceljs";

export interface SheetData {
  name: string;
  columns: string[];
  rows: (string | number | boolean | null)[][];
}

/** Zet tekst om naar een getal als dat eenduidig kan (ook Nederlandse notatie: 1.234,56 en € 12,50). */
export function toCellValue(v: string | number | boolean | null): string | number | boolean | null {
  if (typeof v !== "string") return v;
  const s = v.trim().replace(/^€\s*/, "").replace(/\s*€$/, "");
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) return Number(s.replace(/\./g, "").replace(",", "."));
  if (/^-?\d+,\d+$/.test(s)) return Number(s.replace(",", "."));
  if (/^-?\d+(\.\d+)?$/.test(s) && !/^0\d/.test(s)) return Number(s);
  return v;
}

const sheetName = (s: string, used: Set<string>) => {
  let base = s.replace(/[\\/*?:[\]]/g, " ").trim().slice(0, 28) || "Blad";
  let name = base;
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base.slice(0, 25)} ${n}`;
  used.add(name.toLowerCase());
  return name;
};

/** Tabellen → Excel-werkmap met opgemaakte kopregel, vaste kopregel, filters en kolombreedtes. */
export async function renderXlsx(sheets: SheetData[], meta: { title: string; author?: string }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = meta.author ?? "AI WorkStudio Pro";
  wb.title = meta.title;
  wb.created = new Date();
  const used = new Set<string>();
  for (const s of sheets.length ? sheets : [{ name: "Blad1", columns: [], rows: [] }]) {
    const ws = wb.addWorksheet(sheetName(s.name, used), { views: [{ state: "frozen", ySplit: 1 }] });
    ws.addRow(s.columns);
    for (const r of s.rows) ws.addRow(s.columns.map((_, i) => toCellValue(r[i] ?? null)));
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: "FFFFFFFF" } };
    head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B1F3A" } };
    head.alignment = { vertical: "middle" };
    head.height = 20;
    s.columns.forEach((c, i) => {
      const values = [c, ...s.rows.map((r) => String(r[i] ?? ""))];
      ws.getColumn(i + 1).width = Math.min(60, Math.max(10, ...values.map((v) => v.length + 2)));
      const nums = s.rows.map((r) => toCellValue(r[i] ?? null)).filter((v) => typeof v === "number") as number[];
      if (nums.length && nums.some((n) => !Number.isInteger(n))) ws.getColumn(i + 1).numFmt = "#,##0.00";
    });
    if (s.columns.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: s.columns.length } };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Leest een Excel-bestand (max. bladen/rijen) als tabellen. Formules worden als resultaatwaarde gelezen. */
export async function readXlsx(buf: Buffer, limits = { sheets: 10, rows: 5000, cols: 60 }): Promise<SheetData[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const out: SheetData[] = [];
  wb.eachSheet((ws) => {
    if (out.length >= limits.sheets) return;
    const rows: (string | number | boolean | null)[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      if (rows.length > limits.rows) return;
      const vals: (string | number | boolean | null)[] = [];
      for (let c = 1; c <= Math.min(limits.cols, ws.columnCount); c++) {
        const v = row.getCell(c).value as unknown;
        if (v === null || v === undefined) vals.push(null);
        else if (typeof v === "object" && v !== null && "result" in v) vals.push((v as { result: string | number | boolean }).result ?? null);
        else if (typeof v === "object" && v !== null && "richText" in v) vals.push((v as { richText: { text: string }[] }).richText.map((t) => t.text).join(""));
        else if (typeof v === "object" && v !== null && "text" in v) vals.push(String((v as { text: string }).text));
        else if (v instanceof Date) vals.push(v.toISOString().slice(0, 10));
        else vals.push(v as string | number | boolean);
      }
      rows.push(vals);
    });
    const [header = [], ...data] = rows;
    out.push({ name: ws.name, columns: header.map((h, i) => (h === null || h === "" ? `Kolom ${i + 1}` : String(h))), rows: data });
  });
  return out;
}

/** Tabellen als leesbare tekst voor het AI-model. */
export function sheetsToText(sheets: SheetData[], maxRows = 400): string {
  return sheets.map((s) => {
    const lines = s.rows.slice(0, maxRows).map((r, i) => `Rij ${i + 1}: ${s.columns.map((c, j) => `${c}: ${r[j] ?? ""}`).join("; ")}`);
    const more = s.rows.length > maxRows ? `\n… nog ${s.rows.length - maxRows} rijen niet getoond` : "";
    return `## Blad "${s.name}" (${s.rows.length} rijen, kolommen: ${s.columns.join(", ")})\n${lines.join("\n")}${more}`;
  }).join("\n\n");
}
