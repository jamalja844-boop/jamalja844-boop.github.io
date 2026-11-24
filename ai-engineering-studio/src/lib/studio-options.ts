import { withTenant, type TenantContext } from "@/lib/db";
import { providerStatuses } from "@/lib/ai/service";
import { roleRank, type OrgRole } from "@/lib/auth/rbac";
import { demoProviderEnabled } from "@/lib/env";
import { serialize } from "@/lib/utils";
import { composeSystemPrompt, type PromptVersionData } from "@/lib/prompts/template";

/** Keuzelijsten voor modellen, tools, kennisbanken en prompts (gedeeld door meerdere modules). */
export async function studioOptions(ctx: TenantContext, role: OrgRole) {
  return withTenant(ctx, async (tx) => {
    const providers = await providerStatuses(tx);
    const models = await tx<{ id: string; provider: string; model_id: string; display_name: string; is_default: boolean; input_price: string | null; output_price: string | null; supports_tools: boolean }[]>`
      select id, provider, model_id, display_name, is_default, input_price, output_price, supports_tools
        from ai_models where is_enabled and kind = 'chat' order by provider, is_default desc, display_name`;
    const tools = await tx<{ key: string; name: string; description: string; category: string; risk_level: string; requires_approval: boolean; min_role: OrgRole }[]>`
      select key, name, description, category, risk_level, requires_approval, min_role from tools where is_enabled order by category, name`;
    const knowledgeBases = await tx<{ id: string; name: string; documents: number }[]>`
      select kb.id, kb.name, (select count(*)::int from documents d where d.knowledge_base_id = kb.id and d.status = 'ready') as documents
        from knowledge_bases kb order by kb.name`;
    const promptRows = await tx<(PromptVersionData & { id: string; name: string; version: number })[]>`
      select p.id, p.name, v.version, v.role, v.context, v.goal, v.system_prompt, v.user_template, v.variables, v.output_format, v.output_schema
        from prompts p join prompt_versions v on v.prompt_id = p.id and v.version = p.current_version order by p.name`;
    const prompts = promptRows.map((p) => {
      let system = "";
      try {
        system = composeSystemPrompt(p);
      } catch {
        system = p.system_prompt;
      }
      return { id: p.id, name: p.name, version: p.version, system, user_template: p.user_template, variables: p.variables, output_format: p.output_format };
    });
    const configured = new Set(providers.filter((p) => p.configured).map((p) => p.provider));
    return serialize({
      providers,
      models: models
        .filter((m) => m.provider !== "demo" || demoProviderEnabled())
        .map((m) => ({ ...m, available: configured.has(m.provider as never) })),
      tools: tools.filter((t) => roleRank(role) >= roleRank(t.min_role)),
      knowledgeBases,
      prompts,
    });
  });
}

export type StudioOptions = Awaited<ReturnType<typeof studioOptions>>;
