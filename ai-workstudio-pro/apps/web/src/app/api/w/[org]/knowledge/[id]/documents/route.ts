import { z } from "zod";
import { orgHandler } from "@/lib/api/handler";
import { ApiError, notFound } from "@/lib/api/errors";
import { withTenant } from "@/lib/db";
import { env } from "@/lib/env";
import { sha256 } from "@/lib/security/crypto";
import { audit } from "@/lib/security/audit";
import { detectType, SUPPORTED_TYPES, verifyMagic } from "@/lib/rag/extract";
import { processDocument } from "@/lib/rag/ingest";
import { enqueue } from "@/lib/jobs/queue";

export const maxDuration = 300;
const INLINE_LIMIT = 1_500_000;

export const GET = orgHandler<{ org: string; id: string }>({ permission: "knowledge.view" }, async ({ ctx, params }) => {
  const id = z.string().uuid().parse(params.id);
  const documents = await withTenant(ctx.tenant, (tx) => tx`
    select id, title, filename, mime_type, size_bytes, min_role, status, error, chunk_count, char_count, has_embeddings, created_at
      from documents where knowledge_base_id = ${id} order by created_at desc`);
  return { documents };
});

/** Upload (multipart/form-data): file, minRole?, title?. Kleine bestanden worden direct verwerkt, grote via de job-queue. */
export const POST = orgHandler<{ org: string; id: string }>(
  { permission: "knowledge.manage", rate: { name: "upload", limit: 60, windowSec: 600 } },
  async ({ req, ctx, params }) => {
    const kbId = z.string().uuid().parse(params.id);
    const maxBytes = env().MAX_UPLOAD_MB * 1024 * 1024;
    if (Number(req.headers.get("content-length") ?? 0) > maxBytes + 100_000) throw new ApiError(413, `Bestand is groter dan ${env().MAX_UPLOAD_MB} MB`);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "Geen bestand ontvangen");
    if (file.size > maxBytes) throw new ApiError(413, `Bestand is groter dan ${env().MAX_UPLOAD_MB} MB`);
    if (file.size === 0) throw new ApiError(400, "Leeg bestand");
    const filename = file.name.replace(/[^\p{L}\p{N}._ ()-]/gu, "_").slice(0, 200);
    const type = detectType(filename, file.type);
    if (!type) throw new ApiError(415, `Niet-ondersteund bestandstype. Toegestaan: ${Object.keys(SUPPORTED_TYPES).join(", ")}`);
    const buf = Buffer.from(await file.arrayBuffer());
    if (!verifyMagic(type, buf)) throw new ApiError(415, "De inhoud van het bestand komt niet overeen met de extensie");
    const minRole = z.enum(["owner", "admin", "developer", "member", "viewer"]).parse(form.get("minRole") ?? "viewer");
    const title = String(form.get("title") || filename.replace(/\.[^.]+$/, "")).slice(0, 200);
    const hash = sha256(buf);

    const docId = await withTenant(ctx.tenant, async (tx) => {
      const [kb] = await tx`select id from knowledge_bases where id = ${kbId}`;
      if (!kb) throw notFound("Kennisbank");
      const [dup] = await tx<{ id: string }[]>`select id from documents where knowledge_base_id = ${kbId} and sha256 = ${hash}`;
      if (dup) throw new ApiError(409, "Dit document staat al in deze kennisbank");
      const [doc] = await tx<{ id: string }[]>`
        insert into documents (org_id, knowledge_base_id, title, filename, mime_type, size_bytes, sha256, min_role, uploaded_by)
        values (app_org_id(), ${kbId}, ${title}, ${filename}, ${SUPPORTED_TYPES[type]}, ${buf.length}, ${hash}, ${minRole}, app_user_id())
        returning id`;
      await tx`insert into document_blobs (document_id, org_id, data) values (${doc.id}, app_org_id(), ${buf})`;
      await audit(tx, { action: "document.uploaded", targetType: "document", targetId: doc.id, metadata: { filename, size: buf.length, minRole } });
      if (buf.length > INLINE_LIMIT) await enqueue(tx, "document.ingest", { documentId: doc.id });
      return doc.id;
    });

    if (buf.length <= INLINE_LIMIT) {
      try {
        const r = await processDocument(ctx.tenant, docId);
        return { id: docId, status: "ready", ...r };
      } catch (e) {
        return { id: docId, status: "failed", error: e instanceof Error ? e.message : String(e) };
      }
    }
    return { id: docId, status: "uploaded", queued: true };
  },
);
