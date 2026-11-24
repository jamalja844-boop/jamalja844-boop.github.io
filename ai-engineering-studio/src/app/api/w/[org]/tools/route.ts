import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/security/audit";
import { builtinTool } from "@/lib/tools/definitions";

export const GET = orgHandler({ permission: "dashboard.view" }, async ({ ctx }) => {
  const tools = await withTenant(ctx.tenant, (tx) => tx`
    select t.id, t.key, t.name, t.description, t.handler, t.category, t.input_schema, t.output_schema, t.config, t.risk_level,
           t.requires_approval, t.min_role, t.is_enabled, t.timeout_ms,
           (select count(*)::int from tool_executions e where e.tool_id = t.id) as executions
      from tools t order by t.category, t.name`);
  return { tools };
});

const createSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/, "Sleutel: kleine letters, cijfers en _"),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(10).max(1000),
  allowedDomains: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Ongeldig domein")).min(1).max(20),
  minRole: z.enum(["admin", "developer", "member", "viewer"]).default("developer"),
});

/** Eigen REST-API-tool: kopie van de http_request-handler met eigen domeinen en omschrijving. */
export const POST = orgHandler({ permission: "tools.manage" }, async ({ req, ctx }) => {
  const input = await parseJson(req, createSchema);
  const base = builtinTool("http_request")!;
  const [row] = await withTenant(ctx.tenant, async (tx) => {
    const r = await tx<{ id: string }[]>`
      insert into tools (org_id, key, name, description, handler, category, input_schema, output_schema, config, risk_level, requires_approval, min_role, created_by)
      values (app_org_id(), ${input.key}, ${input.name}, ${input.description}, 'http_request', 'integratie', ${tx.json(base.inputSchema as never)},
              ${tx.json(base.outputSchema as never)}, ${tx.json({ allowed_domains: input.allowedDomains })}, 'write', true, ${input.minRole}, app_user_id())
      returning id`;
    await audit(tx, { action: "tool.created", targetType: "tool", targetId: input.key, metadata: { allowedDomains: input.allowedDomains } });
    return r;
  });
  return { id: row.id };
});
