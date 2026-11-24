/**
 * Eenvoudige, voorspelbare Markdown-parser voor documentgeneratie.
 * Ondersteunt: koppen (#–####), alinea's, opsommingen (- * •), genummerde lijsten,
 * tabellen (| a | b |), codeblokken (```), horizontale lijnen en inline **vet** / *cursief*.
 */
export type Inline = { text: string; bold?: boolean; italic?: boolean; code?: boolean };

export type Block =
  | { type: "heading"; level: 1 | 2 | 3 | 4; inlines: Inline[] }
  | { type: "paragraph"; inlines: Inline[] }
  | { type: "bullets"; items: Inline[][] }
  | { type: "numbered"; items: Inline[][] }
  | { type: "table"; header: string[]; rows: string[][] }
  | { type: "code"; text: string }
  | { type: "rule" };

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    const t = m[0];
    if (t.startsWith("**") || t.startsWith("__")) out.push({ text: t.slice(2, -2), bold: true });
    else if (t.startsWith("`")) out.push({ text: t.slice(1, -1), code: true });
    else out.push({ text: t.slice(1, -1), italic: true });
    last = m.index + t.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  // Links [tekst](url) → "tekst (url)"
  return out.map((i) => ({ ...i, text: i.text.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, "$1 ($2)") }));
}

export const plainText = (inlines: Inline[]) => inlines.map((i) => i.text).join("");

const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isTableSep = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const splitRow = (l: string) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r/g, "").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^```/.test(line.trim())) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) buf.push(lines[i++]);
      i++;
      blocks.push({ type: "code", text: buf.join("\n") });
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (h) {
      blocks.push({ type: "heading", level: Math.min(4, h[1].length) as 1 | 2 | 3 | 4, inlines: parseInline(h[2]) });
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { blocks.push({ type: "rule" }); i++; continue; }
    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) rows.push(splitRow(lines[i++]));
      blocks.push({ type: "table", header, rows: rows.map((r) => header.map((_, j) => r[j] ?? "")) });
      continue;
    }
    if (/^\s*[-*•]\s+/.test(line)) {
      const items: Inline[][] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) items.push(parseInline(lines[i++].replace(/^\s*[-*•]\s+/, "")));
      blocks.push({ type: "bullets", items });
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: Inline[][] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(parseInline(lines[i++].replace(/^\s*\d+[.)]\s+/, "")));
      blocks.push({ type: "numbered", items });
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length && lines[i].trim() && !/^(#{1,6})\s/.test(lines[i]) && !/^```/.test(lines[i].trim()) &&
      !/^\s*[-*•]\s+/.test(lines[i]) && !/^\s*\d+[.)]\s+/.test(lines[i]) && !(isTableRow(lines[i]) && isTableSep(lines[i + 1] ?? ""))
    ) para.push(lines[i++].trim());
    blocks.push({ type: "paragraph", inlines: parseInline(para.join("\n")) });
  }
  return blocks;
}

/** Alle tabellen uit Markdown, bijv. voor export naar Excel. */
export function tablesFromMarkdown(md: string): { header: string[]; rows: string[][] }[] {
  return parseMarkdown(md).filter((b): b is Extract<Block, { type: "table" }> => b.type === "table").map(({ header, rows }) => ({ header, rows }));
}

/** Verwijdert een "[DEMO …]"-label aan het begin (alleen voor bestandsnamen/titels). */
export function stripDemoLabel(s: string) {
  return s.replace(/^\s*\[DEMO[^\]]*\]\s*/i, "");
}

export function safeFilename(title: string, ext: string) {
  const base = title.replace(/[^\p{L}\p{N} _.-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 80) || "document";
  return `${base}.${ext}`;
}
