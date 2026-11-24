import { withTenant, type TenantContext } from "@/lib/db";
import type { AgentPolicy } from "@/lib/tools/handlers";
import type { OrgRole } from "@/lib/auth/rbac";

/** Laadt het rechtenprofiel van een agent: tools, kennisbanken, datacollecties en clearance. */
export async function loadAgentPolicy(ctx: TenantContext, agentId: string): Promise<AgentPolicy | null> {
  return withTenant(ctx, async (tx) => {
    const [a] = await tx<{ id: string; key: string; name: string; data_scopes: string[]; clearance: OrgRole }[]>`
      select id, key, name, data_scopes, clearance from agents where id = ${agentId}`;
    if (!a) return null;
    const tools = await tx<{ key: string }[]>`
      select t.key from agent_tools at join tools t on t.id = at.tool_id where at.agent_id = ${agentId} and t.is_enabled`;
    const kbs = await tx<{ knowledge_base_id: string }[]>`select knowledge_base_id from agent_knowledge_bases where agent_id = ${agentId}`;
    return {
      id: a.id,
      key: a.key,
      name: a.name,
      dataScopes: a.data_scopes,
      clearance: a.clearance,
      toolKeys: tools.map((t) => t.key),
      knowledgeBaseIds: kbs.map((k) => k.knowledge_base_id),
    };
  });
}
