import type { ExtractedSection } from "@/lib/rag/extract";

export interface Chunk {
  content: string;
  page?: number;
}

function normalize(text: string): string {
  return text.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Deelt tekst op in overlappende fragmenten, bij voorkeur op alinea- en zinsgrenzen.
 * Paginanummers blijven behouden voor bronverwijzingen.
 */
export function chunkSections(sections: ExtractedSection[], size = 1200, overlap = 150): Chunk[] {
  const chunks: Chunk[] = [];
  const ov = Math.min(overlap, Math.floor(size / 3));
  for (const section of sections) {
    const text = normalize(section.text);
    if (!text) continue;
    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + size, text.length);
      if (end < text.length) {
        const window = text.slice(start, end);
        const para = window.lastIndexOf("\n\n");
        const sentence = Math.max(window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! "), window.lastIndexOf("\n"));
        if (para > size * 0.5) end = start + para;
        else if (sentence > size * 0.5) end = start + sentence + 1;
      }
      const content = text.slice(start, end).trim();
      if (content.length > 20 || (content && chunks.length === 0)) chunks.push({ content, page: section.page });
      if (end >= text.length) break;
      start = Math.max(end - ov, start + 1);
      // Begin niet midden in een woord.
      const space = text.indexOf(" ", start);
      if (space > 0 && space - start < 30) start = space + 1;
    }
  }
  return chunks;
}

export const estimateTokens = (s: string) => Math.ceil(s.length / 4);
