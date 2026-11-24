import { z } from "zod";
import { orgHandler } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { withTenant } from "@/lib/db";

export const DELETE = orgHandler<{ org: string; id: string }>({ permission: "chat.use" }, async ({ ctx, params }) => {
  const id = z.string().uuid().parse(params.id);
  const rows = await withTenant(ctx.tenant, (tx) => tx`delete from chat_attachments where id = ${id} returning id`);
  if (!rows.length) throw notFound("Bijlage");
  return { ok: true };
});
