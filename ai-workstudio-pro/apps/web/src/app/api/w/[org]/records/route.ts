import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { withTenant } from "@/lib/db";

export const GET = orgHandler({ permission: "tools.execute" }, async ({ req, ctx }) => {
  const collection = req.nextUrl.searchParams.get("collection");
  const q = req.nextUrl.searchParams.get("q")?.slice(0, 200) || null;
  return withTenant(ctx.tenant, async (tx) => {
    const collections = await tx`select collection, count(*)::int as n from records group by collection order by collection`;
    const records = await tx`
      select id, collection, title, data, status, is_demo, created_by_type, created_at, updated_at from records
       where (${collection}::text is null or collection = ${collection})
         and (${q}::text is null or title ilike ${"%" + (q ?? "") + "%"} or data::text ilike ${"%" + (q ?? "") + "%"})
       order by updated_at desc limit 200`;
    return { collections, records };
  });
});

const createSchema = z.object({
  collection: z.string().regex(/^[a-z][a-z_]{1,39}$/),
  title: z.string().trim().min(1).max(200),
  data: z.record(z.string(), z.unknown()).default({}),
  status: z.string().max(40).optional(),
});

/** Resultaten opslaan (bijv. een AI-antwoord) of handmatig een record toevoegen. */
export const POST = orgHandler({ permission: "tools.execute", rate: { name: "records", limit: 120, windowSec: 60 } }, async ({ req, ctx }) => {
  const input = await parseJson(req, createSchema, 300_000);
  const [row] = await withTenant(ctx.tenant, (tx) => tx<{ id: string }[]>`
    insert into records (org_id, collection, title, data, status, is_demo, created_by_type, created_by_id)
    values (app_org_id(), ${input.collection}, ${input.title}, ${tx.json(input.data as never)}, ${input.status ?? "actief"},
            (select is_demo from organizations where id = app_org_id()), 'user', app_user_id())
    returning id`);
  return { id: row.id };
});
