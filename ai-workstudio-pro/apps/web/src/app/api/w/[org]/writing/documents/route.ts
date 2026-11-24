import { z } from "zod";
import { DOCUMENT_KINDS, saveDocumentSchema } from "@workstudio/shared";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { withTenant } from "@/lib/db";
import { saveDocument } from "@/lib/writing/service";

export const GET = orgHandler({ permission: "writing.use" }, async ({ req, ctx }) => {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim().slice(0, 100) ?? "";
  const kind = z.enum(DOCUMENT_KINDS).nullable().catch(null).parse(sp.get("kind"));
  const status = z.enum(["draft", "approved", "archived"]).nullable().catch(null).parse(sp.get("status"));
  const like = "%" + q.replace(/[%_\\]/g, "\\$&") + "%";
  const documents = await withTenant(ctx.tenant, (tx) => tx`
    select d.id, d.title, d.kind, d.status, d.shared, d.version, d.updated_at, d.created_at, d.user_id = app_user_id() as mine,
           u.name as author, left(d.content, 220) as preview
      from writing_documents d left join users u on u.id = d.user_id
     where (${q} = '' or d.title ilike ${like} or d.content ilike ${like})
       and (${kind}::text is null or d.kind = ${kind})
       and (${status}::text is null or d.status = ${status})
       and (${status}::text is not null or d.status <> 'archived')
     order by d.updated_at desc limit 300`);
  return { documents };
});

export const POST = orgHandler({ permission: "writing.use", rate: { name: "doc-save", limit: 120, windowSec: 60 } }, async ({ req, ctx }) => {
  const input = await parseJson(req, saveDocumentSchema, 1_000_000);
  const id = await saveDocument(ctx.tenant, input);
  return { id };
});
