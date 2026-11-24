import { orgHandler, parseJson } from "@/lib/api/handler";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/security/audit";
import { agentSchema, saveAgent } from "@/lib/agents/service";

export const GET = orgHandler({ permission: "agents.view" }, async ({ ctx }) => {
  const agents = await withTenant(ctx.tenant, (tx) => tx`
    select id, key, name, role_title, department, status, status_detail, provider, model_id, avatar_color, is_enabled, last_active_at
      from agents order by department, name`);
  return { agents };
});

export const POST = orgHandler({ permission: "agents.manage" }, async ({ req, ctx }) => {
  const input = await parseJson(req, agentSchema, 300_000);
  const id = await withTenant(ctx.tenant, async (tx) => {
    const id = await saveAgent(tx, null, input);
    await audit(tx, { action: "agent.created", targetType: "agent", targetId: id, metadata: { key: input.key, tools: input.toolKeys } });
    return id;
  });
  return { id };
});
