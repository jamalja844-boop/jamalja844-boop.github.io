import { json, withTenant, type TenantContext, type Tx } from "@/lib/db";
import type { OrgRole } from "@/lib/auth/rbac";
import { runChat } from "@/lib/ai/service";
import type { ChatMessage, ToolCall } from "@/lib/ai/types";
import { enqueue } from "@/lib/jobs/queue";
import { composeSystemPrompt, type PromptVersionData } from "@/lib/prompts/template";
import { extractJson } from "@/lib/security/schema";
import { UNTRUSTED_DATA_POLICY, wrapUntrusted } from "@/lib/security/injection";
import { executeTool, formatToolResultForModel, loadTools, toolSpecs } from "@/lib/tools/executor";
import { loadAgentPolicy } from "@/lib/agents/policy";

export interface AgentRow {
  id: string;
  key: string;
  name: string;
  description: string;
  role_title: string;
  department: string;
  responsibilities: string;
  goals: string[];
  provider: string;
  model_id: string;
  system_prompt: string;
  prompt_id: string | null;
  data_scopes: string[];
  share_with: string[];
  clearance: OrgRole;
  max_steps: number;
  max_duration_s: number;
  max_cost_usd: string;
}

interface RunState {
  messages?: ChatMessage[];
  plan?: { understanding: string; steps: string[]; success_criteria: string[] };
  activeMs?: number;
  stepIndex?: number;
  verifyAttempts?: number;
  /** Aantal model-iteraties in de actielus (begrensd door max_steps). */
  iterations?: number;
  pendingCall?: ToolCall | null;
  remainingCalls?: ToolCall[];
}

const PLAN_SCHEMA = {
  type: "object",
  properties: {
    understanding: { type: "string", description: "Het doel in eigen woorden" },
    steps: { type: "array", items: { type: "string" }, description: "Concrete stappen (max 6)" },
    success_criteria: { type: "array", items: { type: "string" } },
  },
  required: ["understanding", "steps", "success_criteria"],
  additionalProperties: false,
};

const VERIFY_SCHEMA = {
  type: "object",
  properties: {
    goal_met: { type: "boolean" },
    issues: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
  },
  required: ["goal_met", "issues", "summary"],
  additionalProperties: false,
};

export async function memberRole(tx: Tx, userId: string): Promise<OrgRole> {
  const [m] = await tx<{ role: OrgRole }[]>`select role from memberships where org_id = app_org_id() and user_id = ${userId}`;
  if (!m) throw new Error("De gebruiker die deze taak startte is geen lid meer van de workspace");
  return m.role;
}

export async function buildAgentSystemPrompt(tx: Tx, agent: AgentRow, orgName: string, toolNames: string[]): Promise<string> {
  let linked = "";
  if (agent.prompt_id) {
    const [v] = await tx<PromptVersionData[]>`
      select v.role, v.context, v.goal, v.system_prompt, v.user_template, v.variables, v.output_format, v.output_schema
        from prompts p join prompt_versions v on v.prompt_id = p.id and v.version = p.current_version where p.id = ${agent.prompt_id}`;
    if (v) {
      try {
        linked = composeSystemPrompt(v);
      } catch {
        linked = v.system_prompt;
      }
    }
  }
  return [
    `Je bent ${agent.name}${agent.role_title ? `, ${agent.role_title}` : ""} bij ${orgName} (afdeling ${agent.department}). Antwoord in het Nederlands.`,
    agent.description,
    agent.responsibilities && `## Verantwoordelijkheden\n${agent.responsibilities}`,
    agent.goals.length ? `## Doelstellingen\n${agent.goals.map((g) => `- ${g}`).join("\n")}` : "",
    `## Werkwijze (gecontroleerde agentcyclus)
1. Begrijp het doel. 2. Volg je werkplan. 3. Kies per stap de juiste tool. 4. Voer de actie uit. 5. Controleer het resultaat. 6. Bepaal de volgende stap.
Stop zodra het doel bereikt is en geef dan een helder eindresultaat.`,
    `## Grenzen en rechten
- Beschikbare tools: ${toolNames.length ? toolNames.join(", ") : "geen"}.
- Datacollecties waartoe je toegang hebt: ${agent.data_scopes.length ? agent.data_scopes.join(", ") : "geen"}.
- Gevoelige acties (versturen, verwijderen, publiceren) wachten op goedkeuring van een beheerder; probeer dit nooit te omzeilen.
- Verzin nooit bedrijfsinformatie (prijzen, klantgegevens, afspraken). Zoek het op met de kennisbank of bedrijfsgegevens, of meld dat het ontbreekt.`,
    UNTRUSTED_DATA_POLICY,
    agent.system_prompt && `## Specifieke instructies\n${agent.system_prompt}`,
    linked && `## Gekoppelde prompt\n${linked}`,
  ].filter(Boolean).join("\n\n");
}

async function addStep(ctx: TenantContext, runId: string, state: RunState, step: {
  phase: string; title: string; content?: string; toolKey?: string; toolInput?: unknown; toolOutput?: unknown; status?: string; inputTokens?: number; outputTokens?: number;
}) {
  state.stepIndex = (state.stepIndex ?? 0) + 1;
  await withTenant(ctx, (tx) => tx`
    insert into agent_run_steps (org_id, run_id, step_index, phase, title, content, tool_key, tool_input, tool_output, status, input_tokens, output_tokens)
    values (app_org_id(), ${runId}, ${state.stepIndex!}, ${step.phase}, ${step.title.slice(0, 300)}, ${(step.content ?? "").slice(0, 20000)},
            ${step.toolKey ?? null}, ${step.toolInput === undefined ? null : json(tx, step.toolInput)},
            ${step.toolOutput === undefined ? null : json(tx, step.toolOutput)}, ${step.status ?? "ok"},
            ${step.inputTokens ?? 0}, ${step.outputTokens ?? 0})`);
}

async function addUsage(ctx: TenantContext, runId: string, usage: { inputTokens: number; outputTokens: number }, cost: number | null) {
  const [r] = await withTenant(ctx, (tx) => tx<{ cost_usd: string }[]>`
    update agent_runs set input_tokens = input_tokens + ${usage.inputTokens}, output_tokens = output_tokens + ${usage.outputTokens},
      cost_usd = cost_usd + ${cost ?? 0} where id = ${runId} returning cost_usd`);
  return Number(r.cost_usd);
}

async function setAgentStatus(ctx: TenantContext, agentId: string, status: string, detail: string | null) {
  await withTenant(ctx, (tx) => tx`update agents set status = ${status}, status_detail = ${detail?.slice(0, 200) ?? null}, last_active_at = now() where id = ${agentId}`);
}

async function finishRun(ctx: TenantContext, runId: string, taskId: string | null, agentId: string, outcome: {
  status: "succeeded" | "failed" | "limit_reached"; output?: string; error?: string; verification?: unknown; state: RunState;
}) {
  await withTenant(ctx, async (tx) => {
    await tx`update agent_runs set status = ${outcome.status}, output = ${outcome.output ?? null}, error = ${outcome.error ?? null},
               verification = ${outcome.verification === undefined ? null : json(tx, outcome.verification)}, state = ${json(tx, outcome.state)},
               steps_count = ${outcome.state.stepIndex ?? 0}, pending_approval_id = null, finished_at = now() where id = ${runId}`;
    if (taskId) {
      const [t] = await tx<{ orchestration_id: string | null; workflow_run_id: string | null }[]>`
        update agent_tasks set status = ${outcome.status === "succeeded" ? "succeeded" : "failed"}, result = ${outcome.output ?? null},
          error = ${outcome.error ?? null}, finished_at = now() where id = ${taskId} returning orchestration_id, workflow_run_id`;
      if (t?.orchestration_id) await enqueue(tx, "orchestration.advance", { orchestrationId: t.orchestration_id }, { priority: 3 });
      if (t?.workflow_run_id) await enqueue(tx, "workflow.advance", { runId: t.workflow_run_id }, { priority: 3 });
    }
  });
  await setAgentStatus(ctx, agentId, outcome.status === "succeeded" ? "idle" : outcome.status === "failed" ? "error" : "idle",
    outcome.status === "failed" ? outcome.error ?? "Fout" : outcome.status === "limit_reached" ? "Limiet bereikt bij laatste taak" : null);
}

/** Maakt een taak + run aan voor een agent en zet de uitvoering in de wachtrij. */
export async function startAgentTask(ctx: TenantContext, opts: {
  agentId: string; title: string; instructions: string; input?: Record<string, unknown>;
  orchestrationId?: string | null; workflowRunId?: string | null; planKey?: string | null; dependsOn?: string[]; blocked?: boolean;
}) {
  return withTenant(ctx, async (tx) => {
    const [agent] = await tx<{ provider: string; model_id: string; is_enabled: boolean }[]>`select provider, model_id, is_enabled from agents where id = ${opts.agentId}`;
    if (!agent) throw new Error("Agent niet gevonden");
    if (!agent.is_enabled) throw new Error("Agent is uitgeschakeld");
    const [task] = await tx<{ id: string }[]>`
      insert into agent_tasks (org_id, agent_id, orchestration_id, workflow_run_id, plan_key, title, instructions, input, depends_on, status, created_by)
      values (app_org_id(), ${opts.agentId}, ${opts.orchestrationId ?? null}, ${opts.workflowRunId ?? null}, ${opts.planKey ?? null},
              ${opts.title.slice(0, 300)}, ${opts.instructions}, ${json(tx, opts.input ?? {})}, ${opts.dependsOn ?? []},
              ${opts.blocked ? "blocked" : "queued"}, app_user_id())
      returning id`;
    let runId: string | null = null;
    if (!opts.blocked) runId = await queueRun(tx, task.id, opts.agentId, agent.provider, agent.model_id);
    return { taskId: task.id, runId };
  });
}

export async function queueRun(tx: Tx, taskId: string, agentId: string, provider: string, modelId: string) {
  const [run] = await tx<{ id: string }[]>`
    insert into agent_runs (org_id, agent_id, task_id, status, provider, model_id, created_by)
    values (app_org_id(), ${agentId}, ${taskId}, 'queued', ${provider}, ${modelId}, app_user_id()) returning id`;
  await tx`update agent_tasks set status = 'queued' where id = ${taskId}`;
  await enqueue(tx, "agent.run", { runId: run.id });
  return run.id;
}

function taskPrompt(task: { title: string; instructions: string; input: Record<string, unknown> }, plan: RunState["plan"]) {
  const deps = (task.input.dependency_results as { agent: string; title: string; result: string }[] | undefined) ?? [];
  const input = { ...task.input };
  delete input.dependency_results;
  return [
    `# Taak: ${task.title}`,
    task.instructions,
    Object.keys(input).length ? `## Invoer\n${wrapUntrusted("TAAKINVOER", JSON.stringify(input, null, 2))}` : "",
    deps.length ? `## Resultaten van eerdere deeltaken\n${deps.map((d) => wrapUntrusted(`RESULTAAT ${d.agent}: ${d.title}`, d.result)).join("\n\n")}` : "",
    plan ? `## Jouw werkplan\n${plan.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nSuccescriteria:\n${plan.success_criteria.map((c) => `- ${c}`).join("\n")}` : "",
    "Werk het plan stap voor stap af met je tools en sluit af met een helder eindresultaat.",
  ].filter(Boolean).join("\n\n");
}

/**
 * Voert (of hervat) een agentrun uit. Wordt aangeroepen door de job-worker.
 * Limieten: maximaal aantal stappen, actieve tijd en kosten per run.
 */
export async function executeAgentRun(ctx: TenantContext, runId: string) {
  const loaded = await withTenant(ctx, async (tx) => {
    const [run] = await tx<{ id: string; agent_id: string; task_id: string | null; status: string; state: RunState; cost_usd: string; pending_approval_id: string | null }[]>`
      select id, agent_id, task_id, status, state, cost_usd, pending_approval_id from agent_runs where id = ${runId} for update`;
    if (!run) return null;
    const [agent] = await tx<AgentRow[]>`select * from agents where id = ${run.agent_id}`;
    const [task] = run.task_id ? await tx<{ title: string; instructions: string; input: Record<string, unknown> }[]>`select title, instructions, input from agent_tasks where id = ${run.task_id}` : [];
    const [org] = await tx<{ name: string }[]>`select name from organizations where id = app_org_id()`;
    const role = await memberRole(tx, ctx.userId);
    return { run, agent, task, orgName: org.name, role };
  });
  if (!loaded || !loaded.agent) return { skipped: "run of agent bestaat niet" };
  const { run, agent, task, orgName, role } = loaded;
  if (["succeeded", "failed", "cancelled", "limit_reached"].includes(run.status)) return { skipped: `run is al ${run.status}` };

  const state: RunState = run.state ?? {};
  const segmentStart = Date.now();
  const policy = await loadAgentPolicy(ctx, agent.id);
  if (!policy) return { skipped: "agent verdwenen" };
  const tools = await loadTools(ctx, policy.toolKeys);
  const specs = toolSpecs(tools, role);
  const system = await withTenant(ctx, (tx) => buildAgentSystemPrompt(tx, agent, orgName, specs.map((s) => s.name)));
  const maxCost = Number(agent.max_cost_usd);
  let cost = Number(run.cost_usd);
  const activeMs = () => (state.activeMs ?? 0) + (Date.now() - segmentStart);

  await withTenant(ctx, async (tx) => {
    await tx`update agent_runs set status = 'running', started_at = coalesce(started_at, now()), pending_approval_id = null where id = ${runId}`;
    if (run.task_id) await tx`update agent_tasks set status = 'running', started_at = coalesce(started_at, now()) where id = ${run.task_id}`;
  });
  await setAgentStatus(ctx, agent.id, "working", task?.title ?? "Bezig");

  const llm = (messages: ChatMessage[], extra: { responseFormat?: { type: "json_schema"; name: string; schema: Record<string, unknown> }; withTools?: boolean; source?: "agent" | "verification" }) =>
    runChat({
      ctx, provider: agent.provider, modelId: agent.model_id, source: extra.source ?? "agent", refType: "agent_run", refId: runId,
      request: { system, messages, tools: extra.withTools ? specs : undefined, maxTokens: 16000, effort: "medium", responseFormat: extra.responseFormat },
    });

  try {
    // 1-2. Doel begrijpen en plan maken (alleen bij een nieuwe run).
    if (!state.messages) {
      const planRes = await llm([{ role: "user", content: `${taskPrompt(task ?? { title: "Opdracht", instructions: "", input: {} }, undefined)}\n\nMaak eerst een werkplan. Antwoord alleen met JSON volgens het schema.` }], {
        responseFormat: { type: "json_schema", name: "werkplan", schema: PLAN_SCHEMA },
      });
      cost = await addUsage(ctx, runId, planRes.usage, planRes.costUsd);
      const parsed = extractJson(planRes.text);
      const plan = parsed.ok && typeof parsed.value === "object" && parsed.value
        ? (parsed.value as RunState["plan"])!
        : { understanding: planRes.text.slice(0, 500), steps: ["Voer de taak uit"], success_criteria: ["Taak is uitgevoerd"] };
      plan.steps = (plan.steps ?? []).slice(0, 6);
      plan.success_criteria = plan.success_criteria ?? [];
      state.plan = plan;
      await addStep(ctx, runId, state, { phase: "understand", title: "Doel begrijpen", content: plan.understanding, inputTokens: planRes.usage.inputTokens, outputTokens: planRes.usage.outputTokens });
      await addStep(ctx, runId, state, { phase: "plan", title: `Plan met ${plan.steps.length} stappen`, content: plan.steps.map((s, i) => `${i + 1}. ${s}`).join("\n") });
      await withTenant(ctx, (tx) => tx`update agent_runs set plan = ${json(tx, plan)} where id = ${runId}`);
      state.messages = [{ role: "user", content: taskPrompt(task ?? { title: "Opdracht", instructions: "", input: {} }, plan) }];
    }

    // Hervatten na goedkeuring: resultaat van de wachtende tool-call toevoegen.
    const pendingCalls = [state.pendingCall, ...(state.remainingCalls ?? [])].filter(Boolean) as ToolCall[];
    if (pendingCalls.length) {
      state.pendingCall = null;
      state.remainingCalls = [];
      for (const call of pendingCalls) {
        const r = await resolveOrExecute(ctx, role, policy, runId, call);
        if (r.status === "pending_approval") return await pause(ctx, runId, run.task_id, agent.id, state, call, pendingCalls.slice(pendingCalls.indexOf(call) + 1), r.approvalId!, activeMs());
        const f = formatToolResultForModel(r);
        state.messages!.push({ role: "tool", toolCallId: call.id, name: call.name, content: f.content, isError: f.isError });
        await addStep(ctx, runId, state, { phase: "act", title: `${call.name} ${r.status === "succeeded" ? "uitgevoerd na goedkeuring" : r.status === "rejected" ? "afgewezen" : "mislukt"}`, toolKey: call.name, toolInput: call.input, toolOutput: r.output ?? r.error, status: r.status === "succeeded" ? "ok" : "rejected" });
      }
    }

    // 3-6. Gecontroleerde lus: tool kiezen → uitvoeren → controleren → volgende stap.
    while ((state.iterations ?? 0) < agent.max_steps) {
      if (activeMs() > agent.max_duration_s * 1000) {
        await addStep(ctx, runId, state, { phase: "limit", title: "Tijdslimiet bereikt", status: "error", content: `Maximaal ${agent.max_duration_s} s actieve tijd.` });
        await finishRun(ctx, runId, run.task_id, agent.id, { status: "limit_reached", error: `Tijdslimiet van ${agent.max_duration_s} seconden bereikt`, state: { ...state, activeMs: activeMs() } });
        return { status: "limit_reached" };
      }
      if (cost >= maxCost) {
        await addStep(ctx, runId, state, { phase: "limit", title: "Kostenlimiet bereikt", status: "error", content: `Maximaal $${maxCost.toFixed(2)} per run.` });
        await finishRun(ctx, runId, run.task_id, agent.id, { status: "limit_reached", error: `Kostenlimiet van $${maxCost.toFixed(2)} bereikt`, state: { ...state, activeMs: activeMs() } });
        return { status: "limit_reached" };
      }
      state.iterations = (state.iterations ?? 0) + 1;
      const res = await llm(state.messages!, { withTools: true });
      cost = await addUsage(ctx, runId, res.usage, res.costUsd);
      state.messages!.push({ role: "assistant", content: res.text, toolCalls: res.toolCalls, raw: res.raw, rawProvider: res.provider });

      if (res.stopReason === "refusal") {
        await addStep(ctx, runId, state, { phase: "error", title: "Model weigerde de opdracht", content: (res.notes ?? []).join(" "), status: "error" });
        await finishRun(ctx, runId, run.task_id, agent.id, { status: "failed", error: "Het model heeft de opdracht geweigerd", state: { ...state, activeMs: activeMs() } });
        return { status: "failed" };
      }

      if (res.toolCalls.length) {
        for (let i = 0; i < res.toolCalls.length; i++) {
          const call = res.toolCalls[i];
          await addStep(ctx, runId, state, { phase: "tool_select", title: `Kiest tool ${call.name}`, content: res.text, toolKey: call.name, toolInput: call.input, inputTokens: i === 0 ? res.usage.inputTokens : 0, outputTokens: i === 0 ? res.usage.outputTokens : 0 });
          const r = await executeTool({ ctx, role, toolKey: call.name, input: call.input, actor: { type: "agent", id: agent.id, agent: policy }, agentRunId: runId, toolCallId: call.id });
          if (r.status === "pending_approval") {
            await addStep(ctx, runId, state, { phase: "approval", title: `Wacht op goedkeuring voor ${call.name}`, toolKey: call.name, toolInput: call.input, status: "waiting" });
            return await pause(ctx, runId, run.task_id, agent.id, state, call, res.toolCalls.slice(i + 1), r.approvalId!, activeMs());
          }
          const f = formatToolResultForModel(r);
          state.messages!.push({ role: "tool", toolCallId: call.id, name: call.name, content: f.content, isError: f.isError });
          await addStep(ctx, runId, state, {
            phase: "act", title: `${call.name}: ${r.status === "succeeded" ? "uitgevoerd" : r.status === "rejected" ? "geweigerd" : "mislukt"}`,
            toolKey: call.name, toolInput: call.input, toolOutput: r.output ?? r.error, status: r.status === "succeeded" ? "ok" : "error",
            content: r.injectionFlags.length ? `Waarschuwing: mogelijke prompt-injectie (${r.injectionFlags.join(", ")})` : "",
          });
        }
        await addStep(ctx, runId, state, { phase: "verify", title: "Resultaten controleren", content: "Tool-resultaten ontvangen; het model beoordeelt ze in de volgende stap." });
        await addStep(ctx, runId, state, { phase: "next", title: "Volgende stap bepalen" });
        continue;
      }

      // Eindantwoord → controle tegen doel en succescriteria.
      await addStep(ctx, runId, state, { phase: "final", title: "Eindresultaat opgesteld", content: res.text, inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens });
      const verifyRes = await llm(
        [{ role: "user", content: `Controleer of dit resultaat het doel bereikt.\n\nDoel: ${state.plan?.understanding}\nSuccescriteria:\n${(state.plan?.success_criteria ?? []).map((c) => `- ${c}`).join("\n")}\n\n${wrapUntrusted("RESULTAAT", res.text)}\n\nAntwoord alleen met JSON volgens het schema.` }],
        { responseFormat: { type: "json_schema", name: "controle", schema: VERIFY_SCHEMA }, source: "verification" },
      );
      cost = await addUsage(ctx, runId, verifyRes.usage, verifyRes.costUsd);
      const v = extractJson(verifyRes.text);
      const verification = (v.ok ? v.value : { goal_met: true, issues: [], summary: "Controle niet leesbaar; resultaat geaccepteerd." }) as { goal_met: boolean; issues: string[]; summary: string };
      await addStep(ctx, runId, state, { phase: "verify", title: verification.goal_met ? "Controle: doel bereikt" : "Controle: verbetering nodig", content: [verification.summary, ...(verification.issues ?? []).map((x) => `- ${x}`)].join("\n"), status: verification.goal_met ? "ok" : "error" });

      if (!verification.goal_met && (state.verifyAttempts ?? 0) < 1 && (state.iterations ?? 0) < agent.max_steps) {
        state.verifyAttempts = (state.verifyAttempts ?? 0) + 1;
        state.messages!.push({ role: "user", content: `Controle: het doel is nog niet volledig bereikt.\n${(verification.issues ?? []).map((x) => `- ${x}`).join("\n")}\nVerbeter je resultaat.` });
        await addStep(ctx, runId, state, { phase: "next", title: "Resultaat verbeteren" });
        continue;
      }
      await finishRun(ctx, runId, run.task_id, agent.id, { status: "succeeded", output: res.text, verification, state: { ...state, activeMs: activeMs() } });
      return { status: "succeeded" };
    }

    await addStep(ctx, runId, state, { phase: "limit", title: "Maximaal aantal stappen bereikt", status: "error" });
    await finishRun(ctx, runId, run.task_id, agent.id, { status: "limit_reached", error: `Maximaal ${agent.max_steps} stappen bereikt`, state: { ...state, activeMs: activeMs() } });
    return { status: "limit_reached" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await addStep(ctx, runId, state, { phase: "error", title: "Fout tijdens uitvoering", content: message, status: "error" }).catch(() => {});
    await finishRun(ctx, runId, run.task_id, agent.id, { status: "failed", error: message, state: { ...state, activeMs: activeMs() } });
    return { status: "failed", error: message };
  }
}

async function resolveOrExecute(ctx: TenantContext, role: OrgRole, policy: NonNullable<Awaited<ReturnType<typeof loadAgentPolicy>>>, runId: string, call: ToolCall) {
  const [exec] = await withTenant(ctx, (tx) => tx<{ id: string; status: string; output: unknown; error: string | null; approval_id: string | null; injection_flags: string[] }[]>`
    select id, status, output, error, approval_id, injection_flags from tool_executions where agent_run_id = ${runId} and tool_call_id = ${call.id}
     order by created_at desc limit 1`);
  if (exec) {
    if (exec.status === "pending_approval" || exec.status === "running") return { executionId: exec.id, toolKey: call.name, status: "pending_approval" as const, approvalId: exec.approval_id ?? undefined, injectionFlags: [] };
    return {
      executionId: exec.id,
      toolKey: call.name,
      status: (exec.status === "succeeded" ? "succeeded" : exec.status === "rejected" ? "rejected" : "failed") as "succeeded" | "rejected" | "failed",
      output: exec.output,
      error: exec.error ?? undefined,
      injectionFlags: exec.injection_flags ?? [],
    };
  }
  return executeTool({ ctx, role, toolKey: call.name, input: call.input, actor: { type: "agent", id: policy.id, agent: policy }, agentRunId: runId, toolCallId: call.id });
}

async function pause(ctx: TenantContext, runId: string, taskId: string | null, agentId: string, state: RunState, call: ToolCall, remaining: ToolCall[], approvalId: string, activeMs: number) {
  state.pendingCall = call;
  state.remainingCalls = remaining;
  state.activeMs = activeMs;
  await withTenant(ctx, async (tx) => {
    await tx`update agent_runs set status = 'waiting_approval', pending_approval_id = ${approvalId}, state = ${json(tx, state)}, steps_count = ${state.stepIndex ?? 0} where id = ${runId}`;
    if (taskId) {
      const [t] = await tx<{ orchestration_id: string | null }[]>`update agent_tasks set status = 'waiting_approval' where id = ${taskId} returning orchestration_id`;
      if (t?.orchestration_id) await tx`update orchestrations set status = 'waiting_approval' where id = ${t.orchestration_id} and status = 'running'`;
    }
    await tx`update approval_requests set agent_run_id = ${runId} where id = ${approvalId}`;
  });
  await setAgentStatus(ctx, agentId, "waiting_approval", `Wacht op goedkeuring: ${call.name}`);
  return { status: "waiting_approval", approvalId };
}
