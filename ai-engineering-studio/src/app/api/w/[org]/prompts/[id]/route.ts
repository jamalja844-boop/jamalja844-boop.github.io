import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/security/audit";

type P = { org: string; id: string };

export const GET = orgHandler<P>({ permission: "prompts.view" }, async ({ ctx, params }) => {
  const id = z.string().uuid().parse(params.id);
  return withTenant(ctx.tenant, async (tx) => {
    const [prompt] = await tx`select id, name, description, tags, current_version, created_at, updated_at from prompts where id = ${id}`;
    if (!prompt) throw notFound("Prompt");
    const versions = await tx`select * from prompt_versions where prompt_id = ${id} order by version desc`;
    const runs = await tx`select * from prompt_test_runs where prompt_id = ${id} order by created_at desc limit 40`;
    const agents = await tx`select id, name from agents where prompt_id = ${id}`;
    return { prompt, versions, runs, agents };
  });
});

const patchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().max(1000).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
  currentVersion: z.number().int().positive().optional(),
});

export const PATCH = orgHandler<P>({ permission: "prompts.manage" }, async ({ req, ctx, params }) => {
  const id = z.string().uuid().parse(params.id);
  const input = await parseJson(req, patchSchema);
  return withTenant(ctx.tenant, async (tx) => {
    if (input.currentVersion) {
      const [v] = await tx`select 1 from prompt_versions where prompt_id = ${id} and version = ${input.currentVersion}`;
      if (!v) throw notFound("Versie");
    }
    const [row] = await tx`
      update prompts set name = coalesce(${input.name ?? null}, name), description = coalesce(${input.description ?? null}, description),
        tags = coalesce(${input.tags ?? null}::text[], tags), current_version = coalesce(${input.currentVersion ?? null}, current_version)
      where id = ${id} returning id, current_version`;
    if (!row) throw notFound("Prompt");
    return { prompt: row };
  });
});

export const DELETE = orgHandler<P>({ permission: "prompts.manage" }, async ({ ctx, params }) => {
  const id = z.string().uuid().parse(params.id);
  await withTenant(ctx.tenant, async (tx) => {
    await tx`delete from prompts where id = ${id}`;
    await audit(tx, { action: "prompt.deleted", targetType: "prompt", targetId: id });
  });
  return { ok: true };
});
