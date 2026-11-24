import { z } from "zod";
import { orgHandler } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { withTenant } from "@/lib/db";

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Eenvoudige, veilige Markdown → HTML (koppen, vet, cursief, lijsten, alinea's). Alle invoer wordt eerst ge-escaped. */
function markdownToHtml(md: string): string {
  const inline = (s: string) => escapeHtml(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1<em>$2</em>");
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const block of md.replace(/\r/g, "").split(/\n{2,}/)) {
    const lines = block.split("\n");
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
      if (list !== "ul") { closeList(); out.push("<ul>"); list = "ul"; }
      out.push(...lines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ""))}</li>`));
      continue;
    }
    if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
      if (list !== "ol") { closeList(); out.push("<ol>"); list = "ol"; }
      out.push(...lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ""))}</li>`));
      continue;
    }
    closeList();
    const h = block.match(/^(#{1,4})\s+(.+)$/);
    if (h && lines.length === 1) out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
    else out.push(`<p>${lines.map(inline).join("<br>")}</p>`);
  }
  closeList();
  return out.join("\n");
}

/** Export als Markdown, platte tekst of HTML (printbaar, ook geschikt om als PDF op te slaan). */
export const GET = orgHandler<{ org: string; id: string }>({ permission: "writing.use" }, async ({ req, ctx, params }) => {
  const docId = z.string().uuid().parse(params.id);
  const format = z.enum(["md", "txt", "html"]).catch("md").parse(req.nextUrl.searchParams.get("format"));
  const [doc] = await withTenant(ctx.tenant, (tx) => tx<{ title: string; content: string; version: number; status: string }[]>`
    select title, content, version, status from writing_documents where id = ${docId}`);
  if (!doc) throw notFound("Document");
  const filename = doc.title.replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 80) || "document";
  let body: string;
  let type: string;
  if (format === "txt") {
    body = doc.content.replace(/^#{1,6}\s+/gm, "").replace(/\*\*(.+?)\*\*/g, "$1");
    type = "text/plain; charset=utf-8";
  } else if (format === "html") {
    body = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${escapeHtml(doc.title)}</title>
<style>body{font-family:Georgia,'Times New Roman',serif;max-width:720px;margin:48px auto;padding:0 24px;line-height:1.6;color:#0f172a}
h1,h2,h3{font-family:system-ui,sans-serif;color:#0b1f4d}footer{margin-top:48px;font:12px system-ui,sans-serif;color:#64748b}
@media print{body{margin:0}}</style></head><body>
${markdownToHtml(doc.content)}
<footer>Versie ${doc.version} · ${doc.status === "approved" ? "Goedgekeurd" : "Concept"}</footer></body></html>`;
    type = "text/html; charset=utf-8";
  } else {
    body = doc.content;
    type = "text/markdown; charset=utf-8";
  }
  return new Response(body, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}.${format}"; filename*=UTF-8''${encodeURIComponent(filename)}.${format}`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
