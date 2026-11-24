import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { ApiError, notFound } from "@/lib/api/errors";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/security/audit";
import { builtinTool } from "@/lib/tools/definitions";

type P = { org: string; id: string };

const schema = z.object({
  isEnabled: z.boolean().optional(),
  requiresApproval: z.boolean().optional(),
  minRole: z.enum(["owner", "admin", "developer", "member", "viewer"]).optional(),
  timeoutMs: z.number().int().min(1000).max(120000).optional(),
  description: z.string().trim().min(10).max(1000).optional(),
  allowedDomains: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Ongeldig domein")).max(20).optional(),
});

export const PATCH = orgHandler<P>({ permission: "tools.manage" }, async ({ req, ctx, params }) => {
  const id = z.string().uuid().parse(params.id);
  const input = await parseJson(req, schema);
  return withTenant(ctx.tenant, async (tx) => {
    const [tool] = await tx<{ key: string; handler: string; risk_level: string; config: Record<string, unknown> }[]>`
      select key, handler, risk_level, config from tools where id = ${id}`;
    if (!tool) throw notFound("Tool");
    if (tool.risk_level === "sensitive" && input.requiresApproval === false) {
      throw new ApiError(400, "Gevoelige tools (extern versturen, verwijderen) vereisen altijd goedkeuring.");
    }
    if (input.isEnabled) {
      const integration = builtinTool(tool.key)?.integration ?? (tool.handler === "mcp" ? "mcp" : undefined);
      if (integration && !["http", "mcp"].includes(integration)) {
        const [cred] = await tx`select 1 from credentials where kind = 'integration' and provider = ${integration}`;
        if (!cred) throw new ApiError(424, "Koppel eerst de bijbehorende integratie onder het tabblad Integraties.", { setup: { provider: integration, where: "tools/integrations" } });
      }
      if (tool.handler === "http_request" && !((input.allowedDomains ?? (tool.config.allowed_domains as string[]) ?? []).length)) {
        throw new ApiError(400, "Stel eerst minimaal één toegestaan domein in voor deze REST-tool.");
      }
    }
    const config = input.allowedDomains ? { ...tool.config, allowed_domains: input.allowedDomains } : tool.config;
    const [row] = await tx`
      update tools set
        is_enabled = coalesce(${input.isEnabled ?? null}, is_enabled),
        requires_approval = coalesce(${input.requiresApproval ?? null}, requires_approval),
        min_role = coalesce(${input.minRole ?? null}::org_role, min_role),
        timeout_ms = coalesce(${input.timeoutMs ?? null}, timeout_ms),
        description = coalesce(${input.description ?? null}, description),
        config = ${tx.json(config as never)}
      where id = ${id} returning id, is_enabled, requires_approval, min_role`;
    await audit(tx, { action: "tool.updated", targetType: "tool", targetId: tool.key, metadata: input });
    return { tool: row };
  });
});

export const DELETE = orgHandler<P>({ permission: "tools.manage" }, async ({ ctx, params }) => {
  const id = z.string().uuid().parse(params.id);
  await withTenant(ctx.tenant, async (tx) => {
    const [tool] = await tx<{ key: string }[]>`select key from tools where id = ${id}`;
    if (!tool) throw notFound("Tool");
    if (builtinTool(tool.key)) throw new ApiError(400, "Ingebouwde tools kun je uitschakelen, maar niet verwijderen.");
    await tx`delete from tools where id = ${id}`;
    await audit(tx, { action: "tool.deleted", targetType: "tool", targetId: tool.key });
  });
  return { ok: true };
});
