import { z } from "zod";
import { updateDocumentSchema } from "@workstudio/shared";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/security/audit";
import { updateDocument } from "@/lib/writing/service";

type P = { org: string; id: string };
const id = z.string().uuid();

export const GET = orgHandler<P>({ permission: "writing.use" }, async ({ ctx, params }) => {
  const docId = id.parse(params.id);
  return withTenant(ctx.tenant, async (tx) => {
    const [document] = await tx`
      select d.id, d.title, d.kind, d.content, d.metadata, d.status, d.shared, d.version, d.source_conversation_id,
             d.approved_at, d.created_at, d.updated_at, d.user_id = app_user_id() as mine, u.name as author, a.name as approved_by_name
        from writing_documents d left join users u on u.id = d.user_id left join users a on a.id = d.approved_by
       where d.id = ${docId}`;
    if (!document) throw notFound("Document");
    const versions = await tx`
      select v.version, v.title, v.note, v.created_at, length(v.content) as length, u.name as author
        from writing_document_versions v left join users u on u.id = v.created_by
       where v.document_id = ${docId} order by v.version desc`;
    return { document, versions };
  });
});

export const PATCH = orgHandler<P>({ permission: "writing.use", rate: { name: "doc-update", limit: 240, windowSec: 60 } }, async ({ req, ctx, params }) => {
  const docId = id.parse(params.id);
  const input = await parseJson(req, updateDocumentSchema, 1_000_000);
  const result = await updateDocument(ctx.tenant, docId, input);
  if (input.status === "approved") {
    await withTenant(ctx.tenant, (tx) => audit(tx, { action: "writing.document_approved", targetType: "writing_document", targetId: docId, metadata: { version: result.version } }));
  }
  return result;
});

export const DELETE = orgHandler<P>({ permission: "writing.use" }, async ({ ctx, params }) => {
  const docId = id.parse(params.id);
  await withTenant(ctx.tenant, async (tx) => {
    const [row] = await tx<{ id: string }[]>`delete from writing_documents where id = ${docId} returning id`;
    if (!row) throw notFound("Document (of je bent niet de eigenaar)");
    await audit(tx, { action: "writing.document_deleted", targetType: "writing_document", targetId: docId });
  });
  return { ok: true };
});
