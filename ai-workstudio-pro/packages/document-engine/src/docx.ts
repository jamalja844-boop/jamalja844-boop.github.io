import {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, LevelFormat, Packer, PageNumber, Paragraph, ShadingType, Table,
  TableCell, TableRow, TextRun, WidthType,
} from "docx";
import { parseMarkdown, type Inline } from "./markdown";

export interface DocMeta {
  title: string;
  /** Bijv. bedrijfsnaam, rechtsboven in de koptekst. */
  organization?: string;
  author?: string;
  /** Regel in de voettekst, bijv. "Concept – versie 2". */
  footerNote?: string;
}

const NAVY = "0B1F3A";
const SKY = "3FA6DF";

function runs(inlines: Inline[], base: { bold?: boolean; size?: number; color?: string } = {}): TextRun[] {
  const out: TextRun[] = [];
  for (const i of inlines) {
    const parts = i.text.split("\n");
    parts.forEach((p, n) => {
      out.push(new TextRun({
        text: p, bold: base.bold || i.bold, italics: i.italic, size: base.size, color: base.color,
        font: i.code ? "Consolas" : undefined, break: n > 0 ? 1 : undefined,
      }));
    });
  }
  return out;
}

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];

/** Markdown → Word-document (.docx) met nette opmaak, kop- en voettekst en paginanummers. */
export async function renderDocx(markdown: string, meta: DocMeta): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];
  const blocks = parseMarkdown(markdown);
  const startsWithTitle = blocks[0]?.type === "heading" && blocks[0].level === 1;
  if (!startsWithTitle) children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: meta.title, color: NAVY })] }));

  for (const b of blocks) {
    switch (b.type) {
      case "heading":
        children.push(new Paragraph({ heading: b.level === 1 && b === blocks[0] ? HeadingLevel.TITLE : HEADINGS[b.level - 1], children: runs(b.inlines, { color: NAVY }) }));
        break;
      case "paragraph":
        children.push(new Paragraph({ children: runs(b.inlines), spacing: { after: 160 } }));
        break;
      case "bullets":
        for (const item of b.items) children.push(new Paragraph({ children: runs(item), bullet: { level: 0 } }));
        break;
      case "numbered":
        for (const item of b.items) children.push(new Paragraph({ children: runs(item), numbering: { reference: "nummering", level: 0 } }));
        break;
      case "code":
        for (const l of b.text.split("\n")) {
          children.push(new Paragraph({ children: [new TextRun({ text: l || " ", font: "Consolas", size: 18 })], shading: { type: ShadingType.CLEAR, fill: "F1F5F9", color: "auto" } }));
        }
        break;
      case "rule":
        children.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1", space: 1 } }, children: [] }));
        break;
      case "table": {
        const cell = (text: string, header: boolean) =>
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text, bold: header, color: header ? "FFFFFF" : undefined, size: 20 })] })],
            shading: header ? { type: ShadingType.CLEAR, fill: NAVY, color: "auto" } : undefined,
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
          });
        children.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ tableHeader: true, children: b.header.map((h) => cell(h, true)) }),
            ...b.rows.map((r) => new TableRow({ children: r.map((c) => cell(c, false)) })),
          ],
        }));
        children.push(new Paragraph({ children: [] }));
        break;
      }
    }
  }

  const doc = new Document({
    creator: meta.author ?? "AI WorkStudio Pro",
    title: meta.title,
    description: "Gegenereerd met AI WorkStudio Pro",
    styles: {
      default: { document: { run: { font: "Calibri", size: 22 }, paragraph: { spacing: { line: 288 } } } },
    },
    numbering: {
      config: [{ reference: "nummering", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.START }] }],
    },
    sections: [{
      properties: { page: { margin: { top: 1200, bottom: 1200, left: 1200, right: 1200 } } },
      headers: meta.organization ? {
        default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: meta.organization, color: SKY, bold: true, size: 18 })] })] }),
      } : undefined,
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: `${meta.footerNote ? `${meta.footerNote} · ` : ""}Pagina `, size: 16, color: "64748B" }),
              new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "64748B" }),
              new TextRun({ text: " van ", size: 16, color: "64748B" }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: "64748B" }),
            ],
          })],
        }),
      },
      children,
    }],
  });
  return Packer.toBuffer(doc);
}
