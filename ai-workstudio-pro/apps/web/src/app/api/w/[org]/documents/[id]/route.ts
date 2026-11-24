import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/security/audit";
import { processDocument } from "@/lib/rag/ingest";

type P = { org: string; id: string };

/** Titel of toegangsniveau wijzigen (geldt direct ook voor alle fragmenten). */
export const PATCH = orgHandler<P>({ permission: "knowledge.manage" }, async ({ req, ctx, params }) => {
  const id = z.string().uuid().parse(params.id);
  const input = await parseJson(req, z.object({ title: z.string().trim().min(1).max(200).optional(), minRole: z.enum(["owner", "admin", "developer", "member", "viewer"]).optional() }));
  await withTenant(ctx.tenant, async (tx) => {
    const [d] = await tx`update documents set title = coalesce(${input.title ?? null}, title), min_role = coalesce(${input.minRole ?? null}::org_role, min_role),
                           version = version + 1 where id = ${id} returning id`;
    if (!d) throw notFound("Document");
    if (input.minRole) await tx`update document_chunks set min_role = ${input.minRole} where document_id = ${id}`;
    await audit(tx, { action: "document.updated", targetType: "document", targetId: id, metadata: input });
  });
  return { ok: true };
});

/** Document opnieuw verwerken (bijv. nadat een embeddingmodel is gekoppeld). */
export const POST = orgHandler<P>({ permission: "knowledge.manage", rate: { name: "reprocess", limit: 30, windowSec: 600 } }, async ({ ctx, params }) => {
  const id = z.string().uuid().parse(params.id);
  const r = await processDocument(ctx.tenant, id);
  return { ok: true, ...r };
});

export const DELETE = orgHandler<P>({ permission: "knowledge.manage" }, async ({ ctx, params }) => {
  const id = z.string().uuid().parse(params.id);
  await withTenant(ctx.tenant, async (tx) => {
    const [d] = await tx`delete from documents where id = ${id} returning filename`;
    if (!d) throw notFound("Document");
    await audit(tx, { action: "document.deleted", targetType: "document", targetId: id, metadata: { filename: d.filename } });
  });
  return { ok: true };
});
