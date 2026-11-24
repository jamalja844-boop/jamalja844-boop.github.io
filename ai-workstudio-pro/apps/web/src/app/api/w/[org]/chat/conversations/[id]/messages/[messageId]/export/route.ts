import { z } from "zod";
import { orgHandler } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { withTenant } from "@/lib/db";
import { fileResponse, renderExport, titleFrom } from "@/lib/cowork/files";

/** Eén AI-antwoord downloaden als Word, PDF of Markdown. */
export const GET = orgHandler<{ org: string; id: string; messageId: string }>({ permission: "chat.use" }, async ({ req, ctx, params }) => {
  const convId = z.string().uuid().parse(params.id);
  const messageId = z.string().uuid().parse(params.messageId);
  const format = z.enum(["docx", "pdf", "md"]).catch("docx").parse(req.nextUrl.searchParams.get("format"));
  const [m] = await withTenant(ctx.tenant, (tx) => tx<{ content: string; metadata: { artifact?: { type: string; subject?: string; body?: string } } }[]>`
    select m.content, m.metadata from messages m join conversations c on c.id = m.conversation_id
     where m.id = ${messageId} and c.id = ${convId} and c.user_id = app_user_id() and m.role = 'assistant'`);
  if (!m) throw notFound("Bericht");
  const art = m.metadata?.artifact;
  const content = art?.type === "email" ? `# ${art.subject}\n\n${art.body}` : m.content.replace(/^\s*\[DEMO[^\]]*\]\s*/i, "");
  const title = art?.type === "email" ? art.subject ?? "E-mail" : titleFrom(m.content, "AI-antwoord");
  const out = await renderExport(format, content, { title, organization: ctx.org.name, author: ctx.user.name, footerNote: "Concept" });
  return fileResponse(out.body, out.mime, out.filename);
});
