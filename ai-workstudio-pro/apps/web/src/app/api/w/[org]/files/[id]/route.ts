import { z } from "zod";
import { MIME } from "@workstudio/document-engine";
import { orgHandler } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { withTenant } from "@/lib/db";
import { fileResponse } from "@/lib/cowork/files";

type P = { org: string; id: string };

export const GET = orgHandler<P>({ permission: "cowork.use" }, async ({ ctx, params }) => {
  const id = z.string().uuid().parse(params.id);
  const [f] = await withTenant(ctx.tenant, (tx) => tx<{ filename: string; format: "xlsx" | "docx" | "pdf"; data: Buffer }[]>`
    select filename, format, data from cowork_files where id = ${id}`);
  if (!f) throw notFound("Bestand");
  return fileResponse(f.data, MIME[f.format], f.filename);
});

export const DELETE = orgHandler<P>({ permission: "cowork.use" }, async ({ ctx, params }) => {
  const id = z.string().uuid().parse(params.id);
  const rows = await withTenant(ctx.tenant, (tx) => tx`delete from cowork_files where id = ${id} returning id`);
  if (!rows.length) throw notFound("Bestand");
  return { ok: true };
});
