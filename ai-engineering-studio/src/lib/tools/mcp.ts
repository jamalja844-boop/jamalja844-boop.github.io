import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { json, withTenant, type TenantContext } from "@/lib/db";
import { assertSafeUrl } from "@/lib/security/ssrf";
import { getIntegration, saveIntegration } from "@/lib/tools/integrations";
import type { ToolRow } from "@/lib/tools/handlers";

async function connect(url: string, authorization?: string) {
  const safe = await assertSafeUrl(url);
  const client = new Client({ name: "ai-engineering-studio", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(safe, {
    requestInit: { headers: authorization ? { Authorization: authorization } : {} },
  });
  await client.connect(transport);
  return client;
}

/** Koppelt een remote MCP-server en registreert al zijn tools in de Tool Manager. */
export async function registerMcpServer(ctx: TenantContext, input: { label: string; url: string; authorization?: string }) {
  const client = await connect(input.url, input.authorization);
  let tools: { name: string; description?: string; inputSchema: Record<string, unknown> }[];
  try {
    tools = (await client.listTools()).tools as typeof tools;
  } finally {
    await client.close().catch(() => {});
  }
  const credentialId = await saveIntegration(ctx, "mcp", input.label, { authorization: input.authorization ?? "" }, { url: input.url });
  const prefix = input.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 20) || "mcp";
  const registered: string[] = [];
  await withTenant(ctx, async (tx) => {
    for (const t of tools.slice(0, 100)) {
      const key = `mcp_${prefix}_${t.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`.slice(0, 64);
      await tx`
        insert into tools (org_id, key, name, description, handler, category, input_schema, config, credential_id, risk_level, requires_approval, min_role, created_by)
        values (app_org_id(), ${key}, ${`${input.label}: ${t.name}`}, ${(t.description ?? "MCP-tool").slice(0, 1000)}, 'mcp', 'integratie',
                ${json(tx, t.inputSchema ?? { type: "object", properties: {} })}, ${json(tx, { tool_name: t.name, server: input.label })},
                ${credentialId}, 'write', true, 'developer', app_user_id())
        on conflict (org_id, key) do update set description = excluded.description, input_schema = excluded.input_schema, credential_id = excluded.credential_id`;
      registered.push(key);
    }
  });
  return { tools: registered };
}

export async function callMcpTool(ctx: TenantContext, tool: ToolRow, input: Record<string, unknown>) {
  const integ = await getIntegration(ctx, "mcp", tool.credential_id);
  const client = await connect(String(integ.config.url), integ.secret.authorization || undefined);
  try {
    const result = await client.callTool({ name: String(tool.config.tool_name), arguments: input });
    const content = (result.content as { type: string; text?: string }[] | undefined) ?? [];
    return {
      is_error: Boolean(result.isError),
      text: content.filter((c) => c.type === "text").map((c) => c.text).join("\n").slice(0, 60_000),
      structured: result.structuredContent ?? null,
    };
  } finally {
    await client.close().catch(() => {});
  }
}
