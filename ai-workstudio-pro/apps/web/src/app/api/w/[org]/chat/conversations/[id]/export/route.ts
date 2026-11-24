import { z } from "zod";
import { orgHandler } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { withTenant } from "@/lib/db";

/** Exporteert een gesprek als Markdown-bestand. */
export const GET = orgHandler<{ org: string; id: string }>({ permission: "chat.use" }, async ({ ctx, params }) => {
  const convId = z.string().uuid().parse(params.id);
  const { conv, messages } = await withTenant(ctx.tenant, async (tx) => {
    const [conv] = await tx<{ title: string; created_at: Date }[]>`
      select title, created_at from conversations where id = ${convId} and kind = 'chat' and user_id = app_user_id()`;
    if (!conv) throw notFound("Gesprek");
    const messages = await tx<{ role: string; content: string; created_at: Date }[]>`
      select role, content, created_at from messages where conversation_id = ${convId} and role in ('user', 'assistant') order by created_at`;
    return { conv, messages };
  });
  const fmt = (d: Date) => new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Amsterdam" }).format(d);
  const md = [
    `# ${conv.title}`,
    `_Geëxporteerd uit AI WorkStudio Pro · gestart ${fmt(conv.created_at)}_`,
    ...messages.filter((m) => m.content.trim()).map((m) => `## ${m.role === "user" ? "Jij" : "AI"} · ${fmt(m.created_at)}\n\n${m.content}`),
  ].join("\n\n");
  const filename = conv.title.replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 60) || "gesprek";
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}.md"; filename*=UTF-8''${encodeURIComponent(filename)}.md`,
      "Cache-Control": "no-store",
    },
  });
});
