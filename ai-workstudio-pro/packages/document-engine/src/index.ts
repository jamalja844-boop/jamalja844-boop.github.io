export * from "./markdown";
export { renderDocx, type DocMeta } from "./docx";
export { renderPdf, toWinAnsi } from "./pdf";
export { readXlsx, renderXlsx, sheetsToText, toCellValue, type SheetData } from "./xlsx";

export const MIME = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  md: "text/markdown; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  html: "text/html; charset=utf-8",
} as const;
