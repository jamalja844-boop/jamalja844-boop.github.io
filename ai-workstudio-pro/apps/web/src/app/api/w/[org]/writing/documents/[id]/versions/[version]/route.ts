import { z } from "zod";
import { orgHandler } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { withTenant } from "@/lib/db";

/** Inhoud van één versie (voor vergelijken en terugzetten). */
export const GET = orgHandler<{ org: string; id: string; version: string }>({ permission: "writing.use" }, async ({ ctx, params }) => {
  const docId = z.string().uuid().parse(params.id);
  const version = z.coerce.number().int().positive().parse(params.version);
  const [row] = await withTenant(ctx.tenant, (tx) => tx`
    select version, title, content, note, created_at from writing_document_versions where document_id = ${docId} and version = ${version}`);
  if (!row) throw notFound("Versie");
  return { version: row };
});
