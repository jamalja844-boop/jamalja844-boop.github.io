export interface ExtractedSection {
  text: string;
  page?: number;
}

export const SUPPORTED_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  html: "text/html",
};

export function detectType(filename: string, mime: string): keyof typeof SUPPORTED_TYPES | null {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ext in SUPPORTED_TYPES) return ext as keyof typeof SUPPORTED_TYPES;
  const byMime = Object.entries(SUPPORTED_TYPES).find(([, m]) => m === mime);
  return (byMime?.[0] as keyof typeof SUPPORTED_TYPES) ?? null;
}

/** Controleert magische bytes zodat een bestand niet als ander type vermomd kan worden. */
export function verifyMagic(type: string, buf: Buffer): boolean {
  if (type === "pdf") return buf.subarray(0, 5).toString("latin1") === "%PDF-";
  if (type === "docx") return buf[0] === 0x50 && buf[1] === 0x4b; // ZIP
  // Tekstformaten: geen NUL-bytes in de eerste 8 KB.
  return !buf.subarray(0, 8192).includes(0);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const delimiter = (text.split("\n")[0].match(/;/g)?.length ?? 0) > (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(cell.trim()); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim()); cell = "";
      if (row.some((c) => c)) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some((c) => c)) rows.push(row);
  return rows;
}

export async function extractText(type: string, buf: Buffer): Promise<ExtractedSection[]> {
  switch (type) {
    case "pdf": {
      const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const { text } = await pdfText(pdf, { mergePages: false });
      return (text as string[]).map((t, i) => ({ text: t, page: i + 1 })).filter((s) => s.text.trim());
    }
    case "docx": {
      const mammoth = await import("mammoth");
      const res = await mammoth.extractRawText({ buffer: buf });
      return [{ text: res.value }];
    }
    case "csv": {
      const rows = parseCsv(buf.toString("utf8"));
      if (!rows.length) return [];
      const [header, ...data] = rows;
      const lines = data.map((r, i) => `Rij ${i + 1}: ` + header.map((h, j) => `${h || `kolom ${j + 1}`}: ${r[j] ?? ""}`).join("; "));
      return [{ text: lines.join("\n") }];
    }
    case "json": {
      const parsed = JSON.parse(buf.toString("utf8"));
      return [{ text: JSON.stringify(parsed, null, 2) }];
    }
    case "html": {
      const html = buf.toString("utf8");
      const text = html
        .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
      return [{ text }];
    }
    default:
      return [{ text: buf.toString("utf8") }];
  }
}
