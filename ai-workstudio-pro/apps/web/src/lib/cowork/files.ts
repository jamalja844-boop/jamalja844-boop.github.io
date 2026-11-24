import { MIME, renderDocx, renderPdf, renderXlsx, safeFilename, stripDemoLabel, tablesFromMarkdown, type SheetData } from "@workstudio/document-engine";
import { withTenant, json, type TenantContext } from "@/lib/db";
import { ApiError } from "@/lib/api/errors";

export type ExportFormat = "md" | "txt" | "html" | "docx" | "pdf" | "xlsx";

/** Titel uit de eerste regel/kop van een tekst (zonder demo-label en Markdown-tekens). */
export function titleFrom(content: string, fallback = "Document") {
  const first = stripDemoLabel(content).split("\n").find((l) => l.trim()) ?? "";
  return first.replace(/^#+\s*/, "").replace(/^(onderwerp|subject)\s*:\s*/i, "").replace(/[*_`]/g, "").trim().slice(0, 120) || fallback;
}

/** Rendert Markdown-inhoud naar een downloadbaar bestand in het gevraagde formaat. */
export async function renderExport(format: ExportFormat, content: string, meta: { title: string; organization?: string; author?: string; footerNote?: string }) {
  const filename = safeFilename(meta.title, format);
  switch (format) {
    case "docx":
      return { body: await renderDocx(content, meta), mime: MIME.docx, filename };
    case "pdf":
      return { body: Buffer.from(await renderPdf(content, meta)), mime: MIME.pdf, filename };
    case "xlsx": {
      const tables = tablesFromMarkdown(content);
      if (!tables.length) throw new ApiError(409, "Dit document bevat geen tabellen om naar Excel te exporteren");
      const sheets: SheetData[] = tables.map((t, i) => ({ name: tables.length === 1 ? meta.title : `Tabel ${i + 1}`, columns: t.header, rows: t.rows }));
      return { body: await renderXlsx(sheets, meta), mime: MIME.xlsx, filename };
    }
    case "txt":
      return { body: Buffer.from(content.replace(/^#{1,6}\s+/gm, "").replace(/\*\*(.+?)\*\*/g, "$1")), mime: MIME.txt, filename };
    default:
      return { body: Buffer.from(content), mime: MIME.md, filename };
  }
}

/** Downloadrespons met veilige headers. */
export function fileResponse(body: Buffer | Uint8Array, mime: string, filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Content-Length": String(body.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function saveFile(ctx: TenantContext, input: { filename: string; format: "xlsx" | "docx" | "pdf"; data: Buffer; source: "excel_command" | "schedule" | "export"; conversationId?: string | null; metadata?: Record<string, unknown> }) {
  if (input.data.length > 10 * 1024 * 1024) throw new ApiError(413, "Het gegenereerde bestand is groter dan 10 MB");
  const [row] = await withTenant(ctx, (tx) => tx<{ id: string }[]>`
    insert into cowork_files (org_id, user_id, conversation_id, source, filename, format, size_bytes, data, metadata)
    values (app_org_id(), app_user_id(), ${input.conversationId ?? null}, ${input.source}, ${input.filename}, ${input.format}, ${input.data.length},
            ${input.data}, ${json(tx, input.metadata ?? {})})
    returning id`);
  return row.id;
}

/** JSON-schema voor /excel: één of meer tabbladen met kolommen en rijen. */
export const SPREADSHEET_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Korte titel / bestandsnaam" },
    explanation: { type: "string", description: "Korte toelichting in het Nederlands: wat staat erin en welke aannames" },
    sheets: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          columns: { type: "array", items: { type: "string" } },
          rows: { type: "array", items: { type: "array", items: { type: "string" } }, description: "Getallen als tekst zonder valutateken, bijv. 1250.50" },
        },
        required: ["name", "columns", "rows"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "explanation", "sheets"],
  additionalProperties: false,
} as const;
