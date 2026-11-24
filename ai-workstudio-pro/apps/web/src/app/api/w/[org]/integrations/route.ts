import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/security/audit";
import { BUILTIN_TOOLS, INTEGRATIONS, type IntegrationId } from "@/lib/tools/definitions";
import { saveIntegration } from "@/lib/tools/integrations";
import { registerMcpServer } from "@/lib/tools/mcp";

const schema = z.object({
  provider: z.enum(["shopify", "whatsapp", "exa", "sql", "http", "mcp"]),
  label: z.string().trim().min(1).max(60).default("standaard"),
  values: z.record(z.string(), z.string().max(5000)),
});

/** Koppelt een integratie; geheime velden worden versleuteld, overige als configuratie bewaard. */
export const POST = orgHandler({ permission: "credentials.manage", rate: { name: "integrations", limit: 20, windowSec: 600 } }, async ({ req, ctx, ip }) => {
  const input = await parseJson(req, schema);
  if (input.provider === "mcp") {
    const url = input.values.url;
    if (!url) throw new ApiError(400, "Vul de URL van de MCP-server in");
    try {
      const r = await registerMcpServer(ctx.tenant, { label: input.label, url, authorization: input.values.authorization || undefined });
      await withTenant(ctx.tenant, (tx) => audit(tx, { action: "integration.connected", targetType: "integration", targetId: "mcp", ip, metadata: { label: input.label, tools: r.tools.length } }));
      return { tools: r.tools };
    } catch (e) {
      throw new ApiError(502, `MCP-server niet bereikbaar of ongeldig: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const def = INTEGRATIONS[input.provider as IntegrationId];
  const secret: Record<string, string> = {};
  const config: Record<string, unknown> = {};
  for (const f of def.fields) {
    const v = input.values[f.key]?.trim();
    if (f.secret) {
      if (v) secret[f.key] = v;
    } else if (v) config[f.key] = v;
  }
  if (input.provider === "shopify" && !/^[a-z0-9-]+\.myshopify\.com$/i.test(String(config.shop_domain ?? ""))) {
    throw new ApiError(400, "Winkeldomein moet eindigen op .myshopify.com");
  }
  if (input.provider === "sql" && !/^postgres(ql)?:\/\//.test(secret.connection_string ?? "")) {
    throw new ApiError(400, "Gebruik een PostgreSQL connection string (postgres://…)");
  }
  const required = def.fields.filter((f) => f.secret && input.provider !== "http").map((f) => f.key);
  const missing = required.filter((k) => !secret[k]);
  if (missing.length) throw new ApiError(400, `Ontbrekende velden: ${missing.join(", ")}`);
  await saveIntegration(ctx.tenant, input.provider as IntegrationId, input.label, secret, config);
  await withTenant(ctx.tenant, async (tx) => {
    const keys = BUILTIN_TOOLS.filter((t) => t.integration === input.provider && input.provider !== "http").map((t) => t.key);
    if (keys.length) await tx`update tools set is_enabled = true where key = any(${keys})`;
    await audit(tx, { action: "integration.connected", targetType: "integration", targetId: input.provider, ip });
  });
  return { ok: true };
});

export const DELETE = orgHandler({ permission: "credentials.manage" }, async ({ req, ctx, ip }) => {
  const id = z.string().uuid().parse(req.nextUrl.searchParams.get("id"));
  await withTenant(ctx.tenant, async (tx) => {
    const [c] = await tx<{ provider: string }[]>`delete from credentials where id = ${id} and kind = 'integration' returning provider`;
    if (c) {
      const keys = BUILTIN_TOOLS.filter((t) => t.integration === c.provider).map((t) => t.key);
      const [left] = await tx<{ n: number }[]>`select count(*)::int as n from credentials where kind = 'integration' and provider = ${c.provider}`;
      if (!left.n && keys.length) await tx`update tools set is_enabled = false where key = any(${keys})`;
      if (c.provider === "mcp") await tx`update tools set is_enabled = false where credential_id is null and handler = 'mcp'`;
      await audit(tx, { action: "integration.disconnected", targetType: "integration", targetId: c.provider, ip });
    }
  });
  return { ok: true };
});
