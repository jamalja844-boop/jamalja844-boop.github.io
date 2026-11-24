import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { ApiError, notFound } from "@/lib/api/errors";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/security/audit";
import { resolveModel } from "@/lib/ai/service";
import { isValidSchema } from "@/lib/security/schema";

type P = { org: string; id: string };

const fieldSchema = z.object({
  name: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]{0,40}$/),
  label: z.string().trim().min(1).max(120),
  type: z.enum(["text", "textarea", "number", "select", "email"]),
  options: z.array(z.string().max(120)).max(30).optional(),
  required: z.boolean().optional(),
  placeholder: z.string().max(200).optional(),
});

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().max(2000).default(""),
  minRole: z.enum(["owner", "admin", "developer", "member", "viewer"]),
  status: z.enum(["draft", "published", "archived"]).optional(),
  config: z.object({
    provider: z.string().max(30),
    modelId: z.string().max(120),
    promptId: z.string().uuid().nullable(),
    systemPrompt: z.string().max(40_000),
    userTemplate: z.string().max(40_000),
    inputFields: z.array(fieldSchema).min(1).max(20),
    knowledgeBaseIds: z.array(z.string().uuid()).max(20),
    toolKeys: z.array(z.string().regex(/^[a-z][a-z0-9_]{1,63}$/)).max(30),
    output: z.object({ format: z.enum(["text", "markdown", "json_schema"]), schema: z.record(z.string(), z.unknown()).nullable().optional() }),
  }),
});

export const PUT = orgHandler<P>({ permission: "apps.manage" }, async ({ req, ctx, params }) => {
  const id = z.string().uuid().parse(params.id);
  const input = await parseJson(req, schema, 300_000);
  const names = input.config.inputFields.map((f) => f.name);
  if (new Set(names).size !== names.length) throw new ApiError(400, "Veldnamen moeten uniek zijn");
  if (input.config.output.format === "json_schema") {
    const check = isValidSchema(input.config.output.schema);
    if (!check.ok) throw new ApiError(400, `Ongeldig JSON-schema: ${check.error}`);
  }
  return withTenant(ctx.tenant, async (tx) => {
    await resolveModel(tx, input.config.provider, input.config.modelId);
    const [row] = await tx`
      update ai_apps set name = ${input.name}, description = ${input.description}, min_role = ${input.minRole}, config = ${tx.json(input.config as never)},
        status = coalesce(${input.status ?? null}, status), version = version + 1,
        published_at = case when ${input.status === "published"} then now() else published_at end
      where id = ${id} returning id, status, version`;
    if (!row) throw notFound("App");
    await audit(tx, { action: input.status === "published" ? "app.published" : "app.updated", targetType: "app", targetId: id, metadata: { version: row.version } });
    return { app: row };
  });
});

export const DELETE = orgHandler<P>({ permission: "apps.manage" }, async ({ ctx, params }) => {
  const id = z.string().uuid().parse(params.id);
  await withTenant(ctx.tenant, async (tx) => {
    const [a] = await tx`delete from ai_apps where id = ${id} returning name`;
    if (!a) throw notFound("App");
    await audit(tx, { action: "app.deleted", targetType: "app", targetId: id, metadata: { name: a.name } });
  });
  return { ok: true };
});
