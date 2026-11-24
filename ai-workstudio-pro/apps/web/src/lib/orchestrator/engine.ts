import { json, withTenant, type TenantContext } from "@/lib/db";
import { runChat } from "@/lib/ai/service";
import { enqueue } from "@/lib/jobs/queue";
import { extractJson } from "@/lib/security/schema";
import { wrapUntrusted } from "@/lib/security/injection";
import { queueRun } from "@/lib/agents/runner";

export interface PlannedSubtask {
  id: string;
  title: string;
  instructions: string;
  agent_key: string;
  depends_on: string[];
}

interface Plan {
  analysis: string;
  subtasks: PlannedSubtask[];
}

const MAX_SUBTASKS = 8;

function planSchema(agentKeys: string[]) {
  return {
    type: "object",
    properties: {
      analysis: { type: "string", description: "Analyse van de opdracht en aanpak" },
      subtasks: {
        type: "array",
        maxItems: MAX_SUBTASKS,
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Taak-ID, bijv. t1" },
            title: { type: "string" },
            instructions: { type: "string", description: "Concrete opdracht voor de agent" },
            agent_key: { type: "string", enum: agentKeys },
            depends_on: { type: "array", items: { type: "string" }, description: "ID's van taken waarvan het resultaat nodig is" },
          },
          required: ["id", "title", "instructions", "agent_key", "depends_on"],
          additionalProperties: false,
        },
      },
    },
    required: ["analysis", "subtasks"],
    additionalProperties: false,
  };
}

/** Valideert het plan: bekende agents, unieke ID's, afhankelijkheden naar eerdere taken (geen cycli). */
export function validatePlan(plan: unknown, agentKeys: string[]): { ok: true; plan: Plan } | { ok: false; error: string } {
  const p = plan as Plan;
  if (!p || typeof p !== "object" || !Array.isArray(p.subtasks)) return { ok: false, error: "Plan heeft geen deeltaken" };
  if (!p.subtasks.length) return { ok: false, error: "Plan bevat geen deeltaken" };
  if (p.subtasks.length > MAX_SUBTASKS) return { ok: false, error: `Maximaal ${MAX_SUBTASKS} deeltaken` };
  const seen = new Set<string>();
  for (const t of p.subtasks) {
    if (!t.id || seen.has(t.id)) return { ok: false, error: `Dubbele of lege taak-ID: ${t.id}` };
    if (!agentKeys.includes(t.agent_key)) return { ok: false, error: `Onbekende agent: ${t.agent_key}` };
    for (const d of t.depends_on ?? []) if (!seen.has(d)) return { ok: false, error: `Taak ${t.id} hangt af van onbekende of latere taak ${d}` };
    seen.add(t.id);
  }
  return { ok: true, plan: { analysis: String(p.analysis ?? ""), subtasks: p.subtasks.map((t) => ({ ...t, depends_on: t.depends_on ?? [] })) } };
}

export async function createOrchestration(ctx: TenantContext, input: { goal: string; title?: string; provider: string; modelId: string; maxCostUsd?: number }) {
  return withTenant(ctx, async (tx) => {
    const [o] = await tx<{ id: string }[]>`
      insert into orchestrations (org_id, title, goal, status, provider, model_id, max_cost_usd, created_by)
      values (app_org_id(), ${input.title ?? input.goal.slice(0, 80)}, ${input.goal}, 'planning', ${input.provider}, ${input.modelId},
              ${input.maxCostUsd ?? 2}, app_user_id())
      returning id`;
    await enqueue(tx, "orchestration.plan", { orchestrationId: o.id }, { priority: 2 });
    return o.id;
  });
}

async function addCost(ctx: TenantContext, id: string, cost: number | null) {
  await withTenant(ctx, (tx) => tx`update orchestrations set cost_usd = cost_usd + ${cost ?? 0} where id = ${id}`);
}

/** Stap 1: opdracht analyseren en verdelen in deeltaken voor de juiste agents. */
export async function planOrchestration(ctx: TenantContext, orchestrationId: string) {
  const { orch, agents, org } = await withTenant(ctx, async (tx) => {
    const [orch] = await tx<{ id: string; goal: string; status: string; provider: string; model_id: string }[]>`
      select id, goal, status, provider, model_id from orchestrations where id = ${orchestrationId}`;
    const agents = await tx<{ id: string; key: string; name: string; role_title: string; responsibilities: string; provider: string; model_id: string; tools: string[] }[]>`
      select a.id, a.key, a.name, a.role_title, a.responsibilities, a.provider, a.model_id,
             coalesce(array_agg(t.key) filter (where t.key is not null), '{}') as tools
        from agents a left join agent_tools at on at.agent_id = a.id left join tools t on t.id = at.tool_id and t.is_enabled
       where a.is_enabled group by a.id order by a.name`;
    const [org] = await tx<{ name: string }[]>`select name from organizations where id = app_org_id()`;
    return { orch, agents, org };
  });
  if (!orch || orch.status !== "planning") return { skipped: true };
  if (!agents.length) {
    await withTenant(ctx, (tx) => tx`update orchestrations set status = 'failed', error = 'Er zijn geen actieve agents in deze workspace', finished_at = now() where id = ${orchestrationId}`);
    return { status: "failed" };
  }
  const roster = agents.map((a) => `- ${a.key} (${a.name}, ${a.role_title}): ${a.responsibilities.replace(/\s+/g, " ").slice(0, 240)} | tools: ${a.tools.join(", ") || "geen"}`).join("\n");
  const system = `Je bent de AI Orchestrator van ${org.name}. Je verdeelt een opdracht in concrete deeltaken en wijst elke deeltaak toe aan de best passende agent.
Regels:
- Gebruik uitsluitend agents uit de lijst hieronder (agent_key exact overnemen).
- Maximaal ${MAX_SUBTASKS} deeltaken; zo weinig als nodig.
- Gebruik depends_on alleen naar eerdere taken wanneer een taak het resultaat van een andere nodig heeft.
- Instructies moeten zelfstandig uitvoerbaar zijn.

Beschikbare agents:
${roster}`;
  try {
    const res = await runChat({
      ctx, provider: orch.provider, modelId: orch.model_id, source: "orchestrator", refType: "orchestration", refId: orchestrationId,
      request: {
        system,
        messages: [{ role: "user", content: `Opdracht:\n${wrapUntrusted("OPDRACHT", orch.goal)}\n\nMaak het plan. Antwoord alleen met JSON volgens het schema.` }],
        maxTokens: 8000,
        effort: "medium",
        responseFormat: { type: "json_schema", name: "orchestratieplan", schema: planSchema(agents.map((a) => a.key)) },
      },
    });
    await addCost(ctx, orchestrationId, res.costUsd);
    const parsed = extractJson(res.text);
    const check = parsed.ok ? validatePlan(parsed.value, agents.map((a) => a.key)) : { ok: false as const, error: "Plan is geen geldige JSON" };
    if (!check.ok) throw new Error(`Ongeldig plan: ${check.error}`);
    const plan = check.plan;

    await withTenant(ctx, async (tx) => {
      await tx`update orchestrations set plan = ${json(tx, plan)}, status = 'running' where id = ${orchestrationId}`;
      for (const st of plan.subtasks) {
        const agent = agents.find((a) => a.key === st.agent_key)!;
        const blocked = st.depends_on.length > 0;
        const [task] = await tx<{ id: string }[]>`
          insert into agent_tasks (org_id, agent_id, orchestration_id, plan_key, title, instructions, input, depends_on, status, created_by)
          values (app_org_id(), ${agent.id}, ${orchestrationId}, ${st.id}, ${st.title.slice(0, 300)}, ${st.instructions}, ${json(tx, { opdracht: orch.goal })},
                  ${st.depends_on}, ${blocked ? "blocked" : "queued"}, app_user_id())
          returning id`;
        if (!blocked) await queueRun(tx, task.id, agent.id, agent.provider, agent.model_id);
      }
    });
    return { status: "running", subtasks: plan.subtasks.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await withTenant(ctx, (tx) => tx`update orchestrations set status = 'failed', error = ${message.slice(0, 1000)}, finished_at = now() where id = ${orchestrationId}`);
    return { status: "failed", error: message };
  }
}

/**
 * Stap 2: voortgang bewaken. Deblokkeert taken waarvan de afhankelijkheden klaar zijn
 * (resultaten alleen delen als de toegangsrechten dat toestaan), vangt fouten op
 * en stelt het eindrapport samen zodra alles klaar is.
 */
export async function advanceOrchestration(ctx: TenantContext, orchestrationId: string) {
  const outcome = await withTenant(ctx, async (tx) => {
    const [orch] = await tx<{ id: string; status: string; cost_usd: string; max_cost_usd: string }[]>`
      select id, status, cost_usd, max_cost_usd from orchestrations where id = ${orchestrationId} for update`;
    if (!orch || ["completed", "failed", "cancelled", "reporting", "planning"].includes(orch.status)) return { action: "none" as const };
    const tasks = await tx<{ id: string; plan_key: string; status: string; depends_on: string[]; title: string; result: string | null; agent_id: string; agent_key: string; agent_name: string; share_with: string[]; provider: string; model_id: string }[]>`
      select t.id, t.plan_key, t.status, t.depends_on, t.title, t.result, t.agent_id, a.key as agent_key, a.name as agent_name, a.share_with, a.provider, a.model_id
        from agent_tasks t join agents a on a.id = t.agent_id where t.orchestration_id = ${orchestrationId} order by t.created_at`;
    const byKey = new Map(tasks.map((t) => [t.plan_key, t]));
    const overBudget = Number(orch.cost_usd) >= Number(orch.max_cost_usd);

    for (const t of tasks.filter((x) => x.status === "blocked")) {
      const deps = t.depends_on.map((k) => byKey.get(k)).filter(Boolean) as typeof tasks;
      if (deps.some((d) => ["failed", "cancelled"].includes(d.status)) || overBudget) {
        await tx`update agent_tasks set status = 'cancelled', error = ${overBudget ? "Budget van de orchestratie bereikt" : "Een afhankelijke taak is mislukt"}, finished_at = now() where id = ${t.id}`;
        t.status = "cancelled";
        continue;
      }
      if (deps.every((d) => d.status === "succeeded")) {
        const dependencyResults = deps.map((d) => {
          const allowed = d.share_with.includes("*") || d.share_with.includes(t.agent_key);
          return {
            agent: d.agent_name,
            title: d.title,
            result: allowed ? (d.result ?? "") : `[Niet gedeeld: ${d.agent_name} mag zijn resultaten niet met ${t.agent_name} delen volgens de toegangsrechten.]`,
          };
        });
        await tx`update agent_tasks set input = input || ${json(tx, { dependency_results: dependencyResults })} where id = ${t.id}`;
        await queueRun(tx, t.id, t.agent_id, t.provider, t.model_id);
        t.status = "queued";
      }
    }

    const open = tasks.some((t) => ["queued", "running", "blocked", "waiting_approval"].includes(t.status));
    const waiting = tasks.some((t) => t.status === "waiting_approval");
    if (open) {
      await tx`update orchestrations set status = ${waiting ? "waiting_approval" : "running"} where id = ${orchestrationId}`;
      return { action: "wait" as const };
    }
    await tx`update orchestrations set status = 'reporting' where id = ${orchestrationId}`;
    return { action: "report" as const, tasks };
  });

  if (outcome.action !== "report") return outcome;
  return compileReport(ctx, orchestrationId);
}

async function compileReport(ctx: TenantContext, orchestrationId: string) {
  const { orch, tasks } = await withTenant(ctx, async (tx) => {
    const [orch] = await tx<{ goal: string; provider: string; model_id: string; plan: Plan | null }[]>`select goal, provider, model_id, plan from orchestrations where id = ${orchestrationId}`;
    const tasks = await tx<{ plan_key: string; title: string; status: string; result: string | null; error: string | null; agent_name: string }[]>`
      select t.plan_key, t.title, t.status, t.result, t.error, a.name as agent_name from agent_tasks t join agents a on a.id = t.agent_id
       where t.orchestration_id = ${orchestrationId} order by t.created_at`;
    return { orch, tasks };
  });
  const failed = tasks.filter((t) => t.status !== "succeeded");
  const material = tasks
    .map((t) => `### ${t.plan_key} · ${t.title} (${t.agent_name}) – ${t.status}\n${t.status === "succeeded" ? wrapUntrusted(`RESULTAAT ${t.plan_key}`, t.result ?? "") : `Niet geslaagd: ${t.error ?? "onbekend"}`}`)
    .join("\n\n");
  try {
    const res = await runChat({
      ctx, provider: orch.provider, modelId: orch.model_id, source: "orchestrator", refType: "orchestration", refId: orchestrationId,
      request: {
        system: "Je bent de AI Orchestrator. Stel een helder Nederlandstalig eindrapport op in Markdown: samenvatting, resultaten per deeltaak, openstaande punten/fouten en aanbevolen vervolgstappen. Verzin niets dat niet in de resultaten staat.",
        messages: [{ role: "user", content: `Opdracht: ${orch.goal}\n\nResultaten:\n${material}` }],
        maxTokens: 8000,
        effort: "low",
      },
    });
    await addCost(ctx, orchestrationId, res.costUsd);
    await withTenant(ctx, (tx) => tx`
      update orchestrations set status = ${failed.length === tasks.length ? "failed" : "completed"}, final_report = ${res.text},
        error = ${failed.length ? `${failed.length} van ${tasks.length} deeltaken niet geslaagd` : null}, finished_at = now()
      where id = ${orchestrationId}`);
    return { action: "completed" as const };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const fallback = `# Eindrapport (automatisch samengesteld)\n\nHet AI-rapport kon niet worden gemaakt (${message}). Ruwe resultaten:\n\n${tasks.map((t) => `## ${t.title} – ${t.agent_name}\n${t.result ?? t.error ?? ""}`).join("\n\n")}`;
    await withTenant(ctx, (tx) => tx`update orchestrations set status = 'completed', final_report = ${fallback}, error = ${message}, finished_at = now() where id = ${orchestrationId}`);
    return { action: "completed" as const };
  }
}
