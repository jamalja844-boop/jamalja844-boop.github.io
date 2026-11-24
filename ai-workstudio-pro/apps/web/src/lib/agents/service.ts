import { z } from "zod";
import { json, type Tx } from "@/lib/db";
import { ApiError } from "@/lib/api/errors";
import { resolveModel } from "@/lib/ai/service";

export const agentSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/, "Sleutel: kleine letters, cijfers en _ (2-41 tekens)"),
  name: z.string().trim().min(2).max(80),
  description: z.string().max(2000).default(""),
  roleTitle: z.string().max(120).default(""),
  department: z.string().max(80).default("Algemeen"),
  responsibilities: z.string().max(5000).default(""),
  goals: z.array(z.string().trim().min(1).max(300)).max(15).default([]),
  provider: z.string().max(30),
  modelId: z.string().max(120),
  systemPrompt: z.string().max(40000).default(""),
  promptId: z.string().uuid().nullable().default(null),
  dataScopes: z.array(z.string().regex(/^(\*|[a-z][a-z_]{1,39})$/)).max(30).default([]),
  shareWith: z.array(z.string().regex(/^(\*|[a-z][a-z0-9_]{1,40})$/)).max(40).default([]),
  clearance: z.enum(["owner", "admin", "developer", "member", "viewer"]).default("member"),
  maxSteps: z.number().int().min(1).max(50).default(8),
  maxDurationS: z.number().int().min(10).max(3600).default(180),
  maxCostUsd: z.number().min(0.01).max(100).default(0.5),
  avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#2DD4BF"),
  toolKeys: z.array(z.string().regex(/^[a-z][a-z0-9_]{1,63}$/)).max(40).default([]),
  knowledgeBaseIds: z.array(z.string().uuid()).max(20).default([]),
  isEnabled: z.boolean().default(true),
  officePosition: z.object({ x: z.number(), z: z.number() }).partial().optional(),
  templateKey: z.string().max(60).nullable().optional(),
});

export type AgentInput = z.infer<typeof agentSchema>;

/** Maakt of wijzigt een agent inclusief tool- en kennisbankkoppelingen (binnen tenanttransactie). */
export async function saveAgent(tx: Tx, id: string | null, a: AgentInput): Promise<string> {
  await resolveModel(tx, a.provider, a.modelId);
  if (a.promptId) {
    const [p] = await tx`select 1 from prompts where id = ${a.promptId}`;
    if (!p) throw new ApiError(400, "Gekoppelde prompt bestaat niet");
  }
  const tools = a.toolKeys.length ? await tx<{ id: string; key: string }[]>`select id, key from tools where key = any(${a.toolKeys})` : [];
  const missing = a.toolKeys.filter((k) => !tools.some((t) => t.key === k));
  if (missing.length) throw new ApiError(400, `Onbekende tools: ${missing.join(", ")}`);
  const kbs = a.knowledgeBaseIds.length ? await tx<{ id: string }[]>`select id from knowledge_bases where id = any(${a.knowledgeBaseIds}::uuid[])` : [];
  if (kbs.length !== a.knowledgeBaseIds.length) throw new ApiError(400, "Een of meer kennisbanken bestaan niet");

  let agentId = id;
  if (!agentId) {
    const [row] = await tx<{ id: string }[]>`
      insert into agents (org_id, key, name, description, role_title, department, responsibilities, goals, provider, model_id, system_prompt,
        prompt_id, data_scopes, share_with, clearance, max_steps, max_duration_s, max_cost_usd, avatar_color, office_position, template_key, is_enabled, created_by)
      values (app_org_id(), ${a.key}, ${a.name}, ${a.description}, ${a.roleTitle}, ${a.department}, ${a.responsibilities}, ${json(tx, a.goals)},
        ${a.provider}, ${a.modelId}, ${a.systemPrompt}, ${a.promptId}, ${a.dataScopes}, ${a.shareWith}, ${a.clearance}, ${a.maxSteps},
        ${a.maxDurationS}, ${a.maxCostUsd}, ${a.avatarColor}, ${json(tx, a.officePosition ?? {})}, ${a.templateKey ?? null}, ${a.isEnabled}, app_user_id())
      returning id`;
    agentId = row.id;
  } else {
    const [row] = await tx<{ id: string }[]>`
      update agents set key = ${a.key}, name = ${a.name}, description = ${a.description}, role_title = ${a.roleTitle}, department = ${a.department},
        responsibilities = ${a.responsibilities}, goals = ${json(tx, a.goals)}, provider = ${a.provider}, model_id = ${a.modelId},
        system_prompt = ${a.systemPrompt}, prompt_id = ${a.promptId}, data_scopes = ${a.dataScopes}, share_with = ${a.shareWith},
        clearance = ${a.clearance}, max_steps = ${a.maxSteps}, max_duration_s = ${a.maxDurationS}, max_cost_usd = ${a.maxCostUsd},
        avatar_color = ${a.avatarColor}, is_enabled = ${a.isEnabled},
        status = case when ${a.isEnabled} then (case when status = 'disabled' then 'idle' else status end) else 'disabled' end
      where id = ${agentId} returning id`;
    if (!row) throw new ApiError(404, "Agent niet gevonden");
  }
  await tx`delete from agent_tools where agent_id = ${agentId}`;
  for (const t of tools) await tx`insert into agent_tools (agent_id, tool_id, org_id) values (${agentId}, ${t.id}, app_org_id())`;
  await tx`delete from agent_knowledge_bases where agent_id = ${agentId}`;
  for (const k of kbs) await tx`insert into agent_knowledge_bases (agent_id, knowledge_base_id, org_id) values (${agentId}, ${k.id}, app_org_id())`;
  return agentId;
}
