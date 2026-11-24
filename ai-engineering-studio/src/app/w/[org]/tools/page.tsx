import { requireOrg } from "@/lib/auth/context";
import { withTenant } from "@/lib/db";
import { env } from "@/lib/env";
import { serialize } from "@/lib/utils";
import { BUILTIN_TOOLS, INTEGRATIONS } from "@/lib/tools/definitions";
import { PageHeader } from "@/components/ui/misc";
import { ToolManager } from "@/components/tools/tool-manager";

export const metadata = { title: "Tools & Integraties" };

export default async function ToolsPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ tab?: string; google?: string; google_error?: string }> }) {
  const { org } = await params;
  const sp = await searchParams;
  const ctx = await requireOrg(org, "dashboard.view");
  const data = await withTenant(ctx.tenant, async (tx) => {
    const tools = await tx`
      select t.id, t.key, t.name, t.description, t.handler, t.category, t.input_schema, t.output_schema, t.config, t.risk_level,
             t.requires_approval, t.min_role, t.is_enabled, t.timeout_ms,
             (select count(*)::int from tool_executions e where e.tool_id = t.id) as executions
        from tools t order by t.category, t.name`;
    const integrations = await tx`select id, provider, label, value_hint, config, status, created_at from credentials where kind = 'integration' order by provider, label`;
    const executions = await tx`select id, tool_key, actor_type, status, error, duration_ms, injection_flags, created_at from tool_executions order by created_at desc limit 100`;
    const collections = await tx`select collection, count(*)::int as n from records group by collection order by collection`;
    const records = await tx`select id, collection, title, data, status, is_demo, created_by_type, updated_at from records order by updated_at desc limit 200`;
    return serialize({ tools, integrations, executions, records: { collections, records } });
  });
  const tools = (data.tools as unknown as { key: string; handler: string }[]).map((t) => ({
    ...t,
    integration: BUILTIN_TOOLS.find((b) => b.key === t.key)?.integration ?? (t.handler === "mcp" ? "mcp" : null),
  }));
  const integrationDefs = Object.entries(INTEGRATIONS).map(([id, d]) => ({ id, ...d, fields: [...d.fields] }));
  const notice = sp.google === "ok" ? "Google-account gekoppeld. Gmail-, Agenda- en Drive-tools zijn ingeschakeld." : sp.google_error ? `Google-koppeling mislukt: ${sp.google_error}` : null;
  return (
    <>
      <PageHeader eyebrow="Module 4 · AI Tools & Integrations" title="Tool Manager" description="Centrale registratie van alle tools met inputschema, outputschema, rechtenmodel en foutafhandeling. Sleutels blijven versleuteld op de server; gevoelige acties vereisen vooraf goedkeuring." />
      <ToolManager
        slug={org}
        tab={sp.tab && ["tools", "integrations", "executions", "records"].includes(sp.tab) ? sp.tab : "tools"}
        tools={tools as never}
        integrations={data.integrations as never}
        integrationDefs={integrationDefs}
        executions={data.executions as never}
        records={data.records as never}
        can={{ manage: ctx.can("tools.manage"), execute: ctx.can("tools.execute"), credentials: ctx.can("credentials.manage"), deleteRecords: ctx.can("approvals.decide") }}
        googleConfigured={Boolean(env().GOOGLE_CLIENT_ID && env().GOOGLE_CLIENT_SECRET)}
        notice={notice}
      />
    </>
  );
}
