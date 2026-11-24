import { json, type Tx } from "@/lib/db";
import { MODEL_CATALOG } from "@/lib/ai/catalog";
import { BUILTIN_TOOLS } from "@/lib/tools/definitions";

export interface NewOrg {
  slug: string;
  name: string;
  description?: string;
  ownerUserId: string;
  isDemo?: boolean;
}

/** Maakt een workspace met standaardmodellen, ingebouwde tools en een kennisbank. Draait in systeemcontext. */
export async function createOrganization(tx: Tx, input: NewOrg): Promise<string> {
  const [org] = await tx<{ id: string }[]>`
    insert into organizations (slug, name, description, is_demo)
    values (${input.slug}, ${input.name}, ${input.description ?? ""}, ${input.isDemo ?? false})
    returning id`;
  await tx`insert into memberships (org_id, user_id, role) values (${org.id}, ${input.ownerUserId}, 'owner')`;
  await seedOrgDefaults(tx, org.id, input.ownerUserId);
  return org.id;
}

export async function seedOrgDefaults(tx: Tx, orgId: string, userId: string | null) {
  for (const m of MODEL_CATALOG.filter((m) => m.seed)) {
    await tx`
      insert into ai_models (org_id, provider, model_id, display_name, kind, context_window, max_output_tokens,
        input_price, output_price, supports_tools, supports_json, supports_temperature, supports_effort,
        embedding_dims, is_default, source)
      values (${orgId}, ${m.provider}, ${m.modelId}, ${m.displayName}, ${m.kind}, ${m.contextWindow}, ${m.maxOutputTokens},
        ${m.inputPrice}, ${m.outputPrice}, ${m.supportsTools}, ${m.supportsJson}, ${m.supportsTemperature}, ${m.supportsEffort},
        ${m.embeddingDims ?? null}, ${m.isDefault ?? false}, 'catalog')
      on conflict (org_id, provider, model_id) do nothing`;
  }
  for (const t of BUILTIN_TOOLS) {
    await tx`
      insert into tools (org_id, key, name, description, handler, category, input_schema, output_schema, config,
        risk_level, requires_approval, min_role, is_enabled, created_by)
      values (${orgId}, ${t.key}, ${t.name}, ${t.description}, ${t.handler}, ${t.category}, ${json(tx, t.inputSchema)},
        ${json(tx, t.outputSchema)}, ${json(tx, t.defaultConfig ?? {})}, ${t.riskLevel}, ${t.requiresApproval}, ${t.minRole},
        ${!t.integration}, ${userId})
      on conflict (org_id, key) do nothing`;
  }
  await tx`
    insert into knowledge_bases (org_id, name, description, created_by)
    values (${orgId}, 'Algemene kennisbank', 'Bedrijfsdocumenten, procedures en beleid', ${userId})
    on conflict (org_id, name) do nothing`;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "") || "workspace";
}
