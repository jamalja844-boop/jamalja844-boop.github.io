import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { parseMarkdown, type Inline } from "./markdown";
import type { DocMeta } from "./docx";

const A4 = { w: 595.28, h: 841.89 };
const M = { top: 64, bottom: 64, left: 56, right: 56 };
const NAVY = rgb(0.043, 0.122, 0.227);
const SKY = rgb(0.247, 0.651, 0.875);
const GREY = rgb(0.39, 0.45, 0.55);
const TEXT = rgb(0.06, 0.09, 0.16);

/**
 * Standaard-PDF-lettertypen gebruiken WinAnsi-codering. Tekens daarbuiten (emoji, andere schriften)
 * worden vervangen, zodat genereren nooit mislukt. € en Nederlandse accenten worden ondersteund.
 */
const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
export function toWinAnsi(s: string): string {
  return [...s.replace(/\t/g, "  ").replace(/[‐-‒]/g, "-").replace(/ /g, " ")]
    .map((ch) => {
      const c = ch.codePointAt(0)!;
      if (c === 10 || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || WIN_ANSI_EXTRA.has(ch)) return ch;
      return "";
    })
    .join("");
}

interface Fonts { regular: PDFFont; bold: PDFFont; italic: PDFFont; mono: PDFFont }

class Layout {
  page!: PDFPage;
  y = 0;
  pageNo = 0;
  readonly width = A4.w - M.left - M.right;
  constructor(private doc: PDFDocument, private f: Fonts, private meta: DocMeta) {
    this.newPage();
  }
  newPage() {
    this.page = this.doc.addPage([A4.w, A4.h]);
    this.pageNo++;
    this.y = A4.h - M.top;
    if (this.meta.organization) {
      const t = toWinAnsi(this.meta.organization);
      this.page.drawText(t, { x: A4.w - M.right - this.f.bold.widthOfTextAtSize(t, 8.5), y: A4.h - 36, size: 8.5, font: this.f.bold, color: SKY });
    }
  }
  ensure(h: number) {
    if (this.y - h < M.bottom) this.newPage();
  }
  /** Tekst met woordafbreking; runs behouden vet/cursief. */
  text(inlines: Inline[], opts: { size: number; color?: ReturnType<typeof rgb>; indent?: number; bold?: boolean; lineGap?: number; prefix?: string }) {
    const size = opts.size;
    const lh = size * (opts.lineGap ?? 1.45);
    const x0 = M.left + (opts.indent ?? 0);
    const maxW = this.width - (opts.indent ?? 0);
    type Word = { text: string; font: PDFFont; spaceBefore: boolean };
    // Woorden met informatie of er een spatie vóór stond (zodat "**vet**," geen losse komma geeft).
    const words: (Word | "\n")[] = [];
    let pendingSpace = false;
    for (const inl of inlines) {
      const font = inl.code ? this.f.mono : opts.bold || inl.bold ? this.f.bold : inl.italic ? this.f.italic : this.f.regular;
      for (const tok of toWinAnsi(inl.text).split(/(\n| +)/)) {
        if (tok === "\n") { words.push("\n"); pendingSpace = false; continue; }
        if (!tok) continue;
        if (/^ +$/.test(tok)) { pendingSpace = true; continue; }
        words.push({ text: tok, font, spaceBefore: pendingSpace });
        pendingSpace = false;
      }
    }
    const lines: Word[][] = [[]];
    let lineW = 0;
    const space = (font: PDFFont) => font.widthOfTextAtSize(" ", size);
    for (const wd of words) {
      if (wd === "\n") { lines.push([]); lineW = 0; continue; }
      let word = wd.text;
      let w = wd.font.widthOfTextAtSize(word, size);
      // Te lange woorden (bijv. URL's) hard afbreken.
      while (w > maxW) {
        let cut = word.length;
        while (cut > 1 && wd.font.widthOfTextAtSize(word.slice(0, cut), size) > maxW) cut--;
        lines.push([{ text: word.slice(0, cut), font: wd.font, spaceBefore: false }]);
        word = word.slice(cut);
        w = wd.font.widthOfTextAtSize(word, size);
        lines.push([]);
        lineW = 0;
      }
      const cur = lines[lines.length - 1];
      const add = (cur.length && wd.spaceBefore ? space(wd.font) : 0) + w;
      if (lineW + add > maxW && cur.length) {
        lines.push([{ text: word, font: wd.font, spaceBefore: false }]);
        lineW = w;
      } else {
        cur.push({ text: word, font: wd.font, spaceBefore: wd.spaceBefore });
        lineW += add;
      }
    }
    lines.forEach((ln, idx) => {
      this.ensure(lh);
      if (idx === 0 && opts.prefix) this.page.drawText(opts.prefix, { x: x0 - 14, y: this.y - size, size, font: this.f.regular, color: opts.color ?? TEXT });
      let x = x0;
      ln.forEach((w, n) => {
        if (n > 0 && w.spaceBefore) x += space(w.font);
        this.page.drawText(w.text, { x, y: this.y - size, size, font: w.font, color: opts.color ?? TEXT });
        x += w.font.widthOfTextAtSize(w.text, size);
      });
      this.y -= lh;
    });
  }
  gap(h: number) {
    this.y -= h;
  }
  table(header: string[], rows: string[][]) {
    const size = 9;
    const cols = header.length || 1;
    const colW = this.width / cols;
    const pad = 4;
    const wrap = (s: string, font: PDFFont) => {
      const words = toWinAnsi(s).split(/\s+/);
      const out: string[] = [];
      let cur = "";
      for (const w of words) {
        const next = cur ? `${cur} ${w}` : w;
        if (font.widthOfTextAtSize(next, size) > colW - pad * 2 && cur) { out.push(cur); cur = w; } else cur = next;
      }
      out.push(cur);
      return out.map((l) => {
        let t = l;
        while (t.length > 1 && font.widthOfTextAtSize(t, size) > colW - pad * 2) t = t.slice(0, -1);
        return t;
      });
    };
    const drawRow = (cells: string[], head: boolean) => {
      const font = head ? this.f.bold : this.f.regular;
      const wrapped = cells.map((c) => wrap(c, font));
      const h = Math.max(...wrapped.map((w) => w.length)) * (size * 1.35) + pad * 2;
      this.ensure(h);
      if (head) this.page.drawRectangle({ x: M.left, y: this.y - h, width: this.width, height: h, color: NAVY });
      else this.page.drawLine({ start: { x: M.left, y: this.y - h }, end: { x: M.left + this.width, y: this.y - h }, thickness: 0.5, color: rgb(0.8, 0.84, 0.88) });
      wrapped.forEach((lines, ci) => lines.forEach((l, li) => {
        this.page.drawText(l, { x: M.left + ci * colW + pad, y: this.y - pad - size - li * size * 1.35, size, font, color: head ? rgb(1, 1, 1) : TEXT });
      }));
      this.y -= h;
    };
    drawRow(header, true);
    for (const r of rows) drawRow(r, false);
    this.gap(10);
  }
}

/** Markdown → PDF (A4) met koppen, lijsten, tabellen, koptekst en paginanummers. */
export async function renderPdf(markdown: string, meta: DocMeta): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(toWinAnsi(meta.title));
  doc.setCreator("AI WorkStudio Pro");
  doc.setProducer("AI WorkStudio Pro document-engine");
  if (meta.author) doc.setAuthor(toWinAnsi(meta.author));
  const f: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
    mono: await doc.embedFont(StandardFonts.Courier),
  };
  const L = new Layout(doc, f, meta);
  const blocks = parseMarkdown(markdown);
  if (!(blocks[0]?.type === "heading" && blocks[0].level === 1)) {
    L.text([{ text: meta.title }], { size: 20, bold: true, color: NAVY, lineGap: 1.3 });
    L.gap(8);
  }
  const sizes = { 1: 18, 2: 14, 3: 12, 4: 11 } as const;
  for (const b of blocks) {
    switch (b.type) {
      case "heading":
        L.gap(b.level <= 2 ? 8 : 4);
        L.ensure(sizes[b.level] * 3);
        L.text(b.inlines, { size: sizes[b.level], bold: true, color: NAVY, lineGap: 1.3 });
        L.gap(2);
        break;
      case "paragraph":
        L.text(b.inlines, { size: 10.5 });
        L.gap(6);
        break;
      case "bullets":
        for (const it of b.items) L.text(it, { size: 10.5, indent: 16, prefix: "•" });
        L.gap(6);
        break;
      case "numbered":
        b.items.forEach((it, n) => L.text(it, { size: 10.5, indent: 18, prefix: `${n + 1}.` }));
        L.gap(6);
        break;
      case "code":
        L.text([{ text: b.text, code: true }], { size: 9, lineGap: 1.35 });
        L.gap(6);
        break;
      case "rule":
        L.ensure(12);
        L.page.drawLine({ start: { x: M.left, y: L.y - 4 }, end: { x: A4.w - M.right, y: L.y - 4 }, thickness: 0.6, color: rgb(0.8, 0.84, 0.88) });
        L.gap(12);
        break;
      case "table":
        L.table(b.header, b.rows);
        break;
    }
  }
  const pages = doc.getPages();
  const date = new Intl.DateTimeFormat("nl-NL", { dateStyle: "long", timeZone: "Europe/Amsterdam" }).format(new Date());
  pages.forEach((p, i) => {
    const t = toWinAnsi(`${meta.footerNote ? `${meta.footerNote} · ` : ""}${date} · Pagina ${i + 1} van ${pages.length}`);
    p.drawText(t, { x: (A4.w - f.regular.widthOfTextAtSize(t, 8)) / 2, y: 32, size: 8, font: f.regular, color: GREY });
  });
  return doc.save();
}
