import { json, withTenant, type TenantContext } from "@/lib/db";
import { runChat } from "@/lib/ai/service";
import { extractJson } from "@/lib/security/schema";
import { wrapUntrusted } from "@/lib/security/injection";
import { executeTool } from "@/lib/tools/executor";
import { memberRole, startAgentTask } from "@/lib/agents/runner";

export type NodeType = "start" | "agent" | "llm" | "tool" | "check" | "approval" | "output";

export interface WfNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: Record<string, unknown> & { label?: string };
}
export interface WfEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
}
export interface Graph {
  nodes: WfNode[];
  edges: WfEdge[];
}

const TYPES: NodeType[] = ["start", "agent", "llm", "tool", "check", "approval", "output"];

/** Controleert de graaf: bekende types, precies één start, geldige verbindingen en geen cycli. */
export function validateGraph(g: Graph): string[] {
  const errors: string[] = [];
  const ids = new Set(g.nodes.map((n) => n.id));
  if (g.nodes.length > 60) errors.push("Maximaal 60 nodes");
  for (const n of g.nodes) if (!TYPES.includes(n.type)) errors.push(`Onbekend nodetype: ${n.type}`);
  const starts = g.nodes.filter((n) => n.type === "start");
  if (starts.length !== 1) errors.push("Een workflow heeft precies één startnode nodig");
  for (const e of g.edges) if (!ids.has(e.source) || !ids.has(e.target)) errors.push(`Verbinding ${e.id} verwijst naar een onbekende node`);
  for (const n of g.nodes) {
    if (n.type === "agent" && !n.data.agentId) errors.push(`Agent-node "${n.data.label ?? n.id}" heeft geen agent`);
    if (n.type === "tool" && !n.data.toolKey) errors.push(`Tool-node "${n.data.label ?? n.id}" heeft geen tool`);
    if ((n.type === "llm" || n.type === "check") && (!n.data.provider || !n.data.modelId)) errors.push(`Node "${n.data.label ?? n.id}" heeft geen model`);
  }
  // Cyclusdetectie (Kahn).
  const indeg = new Map(g.nodes.map((n) => [n.id, 0]));
  for (const e of g.edges) indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  const queue = [...indeg.entries()].filter(([, d]) => d === 0).map(([id]) => id);
  let visited = 0;
  while (queue.length) {
    const id = queue.shift()!;
    visited++;
    for (const e of g.edges.filter((x) => x.source === id)) {
      indeg.set(e.target, indeg.get(e.target)! - 1);
      if (indeg.get(e.target) === 0) queue.push(e.target);
    }
  }
  if (visited !== g.nodes.length) errors.push("De workflow bevat een lus (cyclus); dat is niet toegestaan");
  return errors;
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && v && "text" in (v as Record<string, unknown>)) return String((v as Record<string, unknown>).text);
  return JSON.stringify(v, null, 2);
}

/** {{input.veld}}, {{prev}} en {{node.<id>}} vervangen. */
export function renderWorkflowTemplate(tpl: string, input: Record<string, unknown>, outputs: Record<string, unknown>, prev: string): string {
  return tpl.replace(/\{\{\s*(input\.([a-zA-Z0-9_]+)|prev|node\.([a-zA-Z0-9_-]+))\s*\}\}/g, (_m, _all, inputKey, nodeId) => {
    if (inputKey) return stringify(input[inputKey]);
    if (nodeId) return stringify(outputs[nodeId]);
    return prev;
  });
}

interface NodeRun { node_id: string; status: string; output: unknown; agent_task_id: string | null; approval_id: string | null }

export async function startWorkflowRun(ctx: TenantContext, workflowId: string, input: Record<string, unknown>) {
  return withTenant(ctx, async (tx) => {
    const [wf] = await tx<{ id: string; graph: Graph; version: number; status: string }[]>`select id, graph, version, status from workflows where id = ${workflowId}`;
    if (!wf) throw new Error("Workflow niet gevonden");
    const errors = validateGraph(wf.graph);
    if (errors.length) throw new Error(`Workflow is ongeldig: ${errors.join("; ")}`);
    const [run] = await tx<{ id: string }[]>`
      insert into workflow_runs (org_id, workflow_id, workflow_version, graph, status, input, created_by)
      values (app_org_id(), ${wf.id}, ${wf.version}, ${json(tx, wf.graph)}, 'running', ${json(tx, input)}, app_user_id()) returning id`;
    const { enqueue } = await import("@/lib/jobs/queue");
    await enqueue(tx, "workflow.advance", { runId: run.id }, { priority: 2 });
    return run.id;
  });
}

async function setNode(ctx: TenantContext, runId: string, nodeId: string, patch: { status: string; output?: unknown; error?: string | null; agentTaskId?: string | null; approvalId?: string | null; input?: unknown }) {
  await withTenant(ctx, async (tx) => {
    await tx`
      update workflow_node_runs set status = ${patch.status},
        output = case when ${patch.output !== undefined} then ${json(tx, patch.output ?? null)} else output end,
        input = case when ${patch.input !== undefined} then ${json(tx, patch.input ?? null)} else input end,
        error = ${patch.error ?? null},
        agent_task_id = coalesce(${patch.agentTaskId ?? null}::uuid, agent_task_id),
        approval_id = coalesce(${patch.approvalId ?? null}::uuid, approval_id),
        finished_at = case when ${["succeeded", "failed", "skipped"].includes(patch.status)} then now() else finished_at end
      where run_id = ${runId} and node_id = ${nodeId}`;
    if (patch.output !== undefined && patch.status === "succeeded") {
      await tx`update workflow_runs set outputs = outputs || ${json(tx, { [nodeId]: patch.output ?? null })} where id = ${runId}`;
    }
  });
}

/** Voert alle nodes uit die klaar zijn; wacht op agents en goedkeuringen via de job-queue. */
export async function advanceWorkflow(ctx: TenantContext, runId: string) {
  for (let guard = 0; guard < 80; guard++) {
    const step = await withTenant(ctx, async (tx) => {
      const [run] = await tx<{ id: string; status: string; graph: Graph; input: Record<string, unknown>; outputs: Record<string, unknown> }[]>`
        select id, status, graph, input, outputs from workflow_runs where id = ${runId} for update`;
      if (!run || ["completed", "failed", "cancelled"].includes(run.status)) return null;
      let nodeRuns = await tx<NodeRun[]>`select node_id, status, output, agent_task_id, approval_id from workflow_node_runs where run_id = ${runId}`;

      // Wachtende nodes bijwerken op basis van agenttaken en goedkeuringen.
      for (const nr of nodeRuns.filter((n) => n.status === "running" || n.status === "waiting_approval")) {
        if (nr.agent_task_id) {
          const [t] = await tx<{ status: string; result: string | null; error: string | null }[]>`select status, result, error from agent_tasks where id = ${nr.agent_task_id}`;
          if (t?.status === "succeeded") await tx`update workflow_node_runs set status = 'succeeded', output = ${json(tx, { text: t.result })}, finished_at = now() where run_id = ${runId} and node_id = ${nr.node_id}`;
          else if (t && ["failed", "cancelled"].includes(t.status)) await tx`update workflow_node_runs set status = 'failed', error = ${t.error ?? "Agenttaak mislukt"}, finished_at = now() where run_id = ${runId} and node_id = ${nr.node_id}`;
          else if (t?.status === "waiting_approval") await tx`update workflow_node_runs set status = 'waiting_approval' where run_id = ${runId} and node_id = ${nr.node_id}`;
        } else if (nr.approval_id) {
          const [a] = await tx<{ status: string; decision_note: string | null; tool_execution_id: string | null }[]>`select status, decision_note, tool_execution_id from approval_requests where id = ${nr.approval_id}`;
          if (a?.status === "approved") {
            let output: unknown = { goedgekeurd: true, toelichting: a.decision_note };
            if (a.tool_execution_id) {
              const [e] = await tx<{ status: string; output: unknown; error: string | null }[]>`select status, output, error from tool_executions where id = ${a.tool_execution_id}`;
              if (e?.status !== "succeeded") {
                await tx`update workflow_node_runs set status = 'failed', error = ${e?.error ?? "Tool mislukt"}, finished_at = now() where run_id = ${runId} and node_id = ${nr.node_id}`;
                continue;
              }
              output = e.output;
            }
            await tx`update workflow_node_runs set status = 'succeeded', output = ${json(tx, output)}, finished_at = now() where run_id = ${runId} and node_id = ${nr.node_id}`;
          } else if (a && ["rejected", "expired", "cancelled"].includes(a.status)) {
            await tx`update workflow_node_runs set status = 'failed', error = ${`Goedkeuring ${a.status === "rejected" ? "afgewezen" : "verlopen"}${a.decision_note ? `: ${a.decision_note}` : ""}`}, finished_at = now() where run_id = ${runId} and node_id = ${nr.node_id}`;
          }
        }
      }
      nodeRuns = await tx<NodeRun[]>`select node_id, status, output, agent_task_id, approval_id from workflow_node_runs where run_id = ${runId}`;
      const outputs: Record<string, unknown> = Object.fromEntries(nodeRuns.filter((n) => n.status === "succeeded").map((n) => [n.node_id, n.output]));
      const status = new Map(nodeRuns.map((n) => [n.node_id, n.status]));

      // Bepaal welke nodes klaar zijn om te starten.
      const ready: { node: WfNode; prev: string }[] = [];
      for (const node of run.graph.nodes) {
        if (status.has(node.id)) continue;
        const incoming = run.graph.edges.filter((e) => e.target === node.id);
        if (node.type === "start") {
          ready.push({ node, prev: "" });
          continue;
        }
        if (!incoming.length) continue;
        const sourcesDone = incoming.every((e) => ["succeeded", "failed", "skipped"].includes(status.get(e.source) ?? ""));
        if (!sourcesDone) continue;
        const active = incoming.filter((e) => {
          if (status.get(e.source) !== "succeeded") return false;
          const src = run.graph.nodes.find((n) => n.id === e.source);
          if (src?.type === "check") {
            const passed = Boolean((outputs[e.source] as { passed?: boolean } | undefined)?.passed);
            return (e.sourceHandle ?? "pass") === (passed ? "pass" : "fail");
          }
          return true;
        });
        if (!active.length) {
          await tx`insert into workflow_node_runs (org_id, run_id, node_id, node_type, status, started_at, finished_at)
                   values (app_org_id(), ${runId}, ${node.id}, ${node.type}, 'skipped', now(), now()) on conflict do nothing`;
          continue;
        }
        ready.push({ node, prev: active.map((e) => stringify(outputs[e.source])).join("\n\n") });
      }
      for (const r of ready) {
        await tx`insert into workflow_node_runs (org_id, run_id, node_id, node_type, status, started_at)
                 values (app_org_id(), ${runId}, ${r.node.id}, ${r.node.type}, 'running', now()) on conflict do nothing`;
      }
      return { run, ready, outputs };
    });
    if (!step) return { status: "done" };
    if (!step.ready.length) break;
    for (const { node, prev } of step.ready) {
      await executeNode(ctx, runId, node, step.run.input, step.outputs, prev);
    }
  }
  return finalizeRun(ctx, runId);
}

async function finalizeRun(ctx: TenantContext, runId: string) {
  return withTenant(ctx, async (tx) => {
    const [run] = await tx<{ graph: Graph; status: string }[]>`select graph, status from workflow_runs where id = ${runId}`;
    if (!run || ["completed", "failed", "cancelled"].includes(run.status)) return { status: run?.status };
    const nodeRuns = await tx<{ node_id: string; status: string; error: string | null }[]>`select node_id, status, error from workflow_node_runs where run_id = ${runId}`;
    const failed = nodeRuns.find((n) => n.status === "failed");
    if (failed) {
      await tx`update workflow_runs set status = 'failed', error = ${`Node ${failed.node_id}: ${failed.error ?? "mislukt"}`}, finished_at = now() where id = ${runId}`;
      return { status: "failed" };
    }
    const waiting = nodeRuns.some((n) => n.status === "waiting_approval");
    const running = nodeRuns.some((n) => n.status === "running");
    const allDone = run.graph.nodes.every((n) => nodeRuns.some((r) => r.node_id === n.id && ["succeeded", "skipped"].includes(r.status)));
    const status = allDone ? "completed" : waiting ? "waiting_approval" : running ? "running" : "running";
    await tx`update workflow_runs set status = ${status}, finished_at = ${allDone ? new Date() : null} where id = ${runId}`;
    return { status };
  });
}

async function executeNode(ctx: TenantContext, runId: string, node: WfNode, input: Record<string, unknown>, outputs: Record<string, unknown>, prev: string) {
  const d = node.data as Record<string, string>;
  const render = (t: string | undefined) => renderWorkflowTemplate(t ?? "", input, outputs, prev);
  try {
    switch (node.type) {
      case "start":
        return setNode(ctx, runId, node.id, { status: "succeeded", output: input });
      case "agent": {
        const instructions = render(d.instructions || "{{prev}}");
        const { taskId } = await startAgentTask(ctx, {
          agentId: d.agentId,
          title: d.label || "Workflowtaak",
          instructions,
          input: { workflow_invoer: input, vorige_stap: prev.slice(0, 20000) },
          workflowRunId: runId,
        });
        return setNode(ctx, runId, node.id, { status: "running", agentTaskId: taskId, input: { instructions } });
      }
      case "llm": {
        const prompt = render(d.prompt || "{{prev}}");
        const r = await runChat({ ctx, provider: d.provider, modelId: d.modelId, source: "workflow", refType: "workflow_run", refId: runId, request: { system: d.system || "Je bent een zakelijke AI-assistent. Antwoord in het Nederlands.", messages: [{ role: "user", content: prompt }], maxTokens: 8000, effort: "low" } });
        await withTenant(ctx, (tx) => tx`update workflow_runs set cost_usd = cost_usd + ${r.costUsd ?? 0} where id = ${runId}`);
        return setNode(ctx, runId, node.id, { status: "succeeded", output: { text: r.text }, input: { prompt } });
      }
      case "check": {
        const r = await runChat({
          ctx, provider: d.provider, modelId: d.modelId, source: "workflow", refType: "workflow_run", refId: runId,
          request: {
            system: "Je bent een kwaliteitscontroleur. Beoordeel streng maar eerlijk of de inhoud aan de criteria voldoet.",
            messages: [{ role: "user", content: `Criteria:\n${d.criteria || "De inhoud is volledig, correct en professioneel."}\n\n${wrapUntrusted("TE CONTROLEREN", prev)}\n\nAntwoord alleen met JSON.` }],
            maxTokens: 2000,
            effort: "low",
            responseFormat: { type: "json_schema", name: "controle", schema: { type: "object", properties: { passed: { type: "boolean" }, feedback: { type: "string" } }, required: ["passed", "feedback"], additionalProperties: false } },
          },
        });
        const parsed = extractJson(r.text);
        const out = parsed.ok ? (parsed.value as { passed: boolean; feedback: string }) : { passed: false, feedback: "Controle niet leesbaar" };
        return setNode(ctx, runId, node.id, { status: "succeeded", output: { ...out, text: prev } });
      }
      case "tool": {
        let toolInput: unknown = {};
        try {
          toolInput = JSON.parse(render(d.input || "{}"));
        } catch {
          return setNode(ctx, runId, node.id, { status: "failed", error: "Tool-invoer is na invullen geen geldige JSON" });
        }
        const role = await withTenant(ctx, (tx) => memberRole(tx, ctx.userId));
        const r = await executeTool({ ctx, role, toolKey: d.toolKey, input: toolInput, actor: { type: "workflow", id: runId }, workflowRunId: runId });
        if (r.status === "pending_approval") return setNode(ctx, runId, node.id, { status: "waiting_approval", approvalId: r.approvalId, input: toolInput });
        if (r.status !== "succeeded") return setNode(ctx, runId, node.id, { status: "failed", error: r.error ?? "Tool mislukt", input: toolInput });
        return setNode(ctx, runId, node.id, { status: "succeeded", output: r.output, input: toolInput });
      }
      case "approval": {
        const [a] = await withTenant(ctx, (tx) => tx<{ id: string }[]>`
          insert into approval_requests (org_id, kind, title, summary, payload, risk_level, requested_by_user_id, workflow_run_id)
          values (app_org_id(), 'workflow_step', ${d.label || "Workflowstap goedkeuren"}, ${(d.instructions || "").slice(0, 600)},
                  ${json(tx, { input: { instructies: d.instructions, te_beoordelen: prev.slice(0, 20000) } })}, 'write', app_user_id(), ${runId})
          returning id`);
        return setNode(ctx, runId, node.id, { status: "waiting_approval", approvalId: a.id });
      }
      case "output": {
        const content = render(d.template || "{{prev}}");
        if (d.kind === "email_draft" || d.kind === "record") {
          const collection = d.kind === "email_draft" ? "email_concepten" : (d.collection || "workflow_resultaten").replace(/[^a-z_]/g, "_");
          const [rec] = await withTenant(ctx, (tx) => tx<{ id: string }[]>`
            insert into records (org_id, collection, title, data, status, is_demo, created_by_type, created_by_id)
            values (app_org_id(), ${collection}, ${render(d.subject || d.label || "Workflowresultaat").slice(0, 200)},
                    ${json(tx, d.kind === "email_draft" ? { to: render(d.to || ""), subject: render(d.subject || ""), body: content } : { inhoud: content })},
                    ${d.kind === "email_draft" ? "concept" : "actief"}, (select is_demo from organizations where id = app_org_id()), 'workflow', ${runId})
            returning id`);
          return setNode(ctx, runId, node.id, { status: "succeeded", output: { text: content, record_id: rec.id, collection } });
        }
        return setNode(ctx, runId, node.id, { status: "succeeded", output: { text: content } });
      }
    }
  } catch (err) {
    return setNode(ctx, runId, node.id, { status: "failed", error: err instanceof Error ? err.message : String(err) });
  }
}
