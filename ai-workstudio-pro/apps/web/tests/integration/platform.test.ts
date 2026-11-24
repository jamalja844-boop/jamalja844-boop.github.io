import { afterAll, describe, expect, it } from "vitest";
import { closeDb, withSystem, withTenant } from "@/lib/db";
import { login, register } from "@/lib/auth/service";
import { getSessionUser } from "@/lib/auth/session";
import { ApiError } from "@/lib/api/errors";
import { rateLimit } from "@/lib/security/ratelimit";
import { executeTool } from "@/lib/tools/executor";
import { decideApproval } from "@/lib/approvals/service";
import { loadAgentPolicy } from "@/lib/agents/policy";
import { processDocument } from "@/lib/rag/ingest";
import { searchKnowledge } from "@/lib/rag/search";
import { runConversationTurn, type ChatEvent } from "@/lib/chat/engine";
import { startAgentTask } from "@/lib/agents/runner";
import { createOrchestration } from "@/lib/orchestrator/engine";
import { installCleanPack } from "@/lib/templates/clean";
import { startWorkflowRun } from "@/lib/workflows/engine";
import { enqueue, claimJob, failJob } from "@/lib/jobs/queue";
import { runApp } from "@/lib/apps/runner";
import { sha256 } from "@/lib/security/crypto";
import { drainJobs, setup } from "./helpers";

afterAll(() => closeDb());

describe("authenticatie", () => {
  it("registreert, logt in, weigert foute wachtwoorden en vergrendelt na herhaalde pogingen", async () => {
    const email = `owner-${Date.now()}@test.nl`;
    await withSystem((tx) => tx`insert into users (email, name, password_hash) values ('bestaat@test.nl', 'x', 'x') on conflict do nothing`);
    process.env.ALLOW_SIGNUP = "true";
    const { resetEnvCache } = await import("@/lib/env");
    resetEnvCache();
    const reg = await register({ name: "Eigenaar", email, password: "Blauwe-Fiets-2026", orgName: "Testbedrijf" }, { ip: "1.1.1.1", userAgent: "test" });
    expect(reg.slug).toMatch(/^testbedrijf/);
    expect((await getSessionUser(reg.token))?.email).toBe(email);
    const ok = await login({ email, password: "Blauwe-Fiets-2026" }, { ip: "1.1.1.2", userAgent: "t" });
    expect(ok.token).toBeTruthy();
    await expect(login({ email, password: "fout-wachtwoord-1" }, { ip: "1.1.1.3", userAgent: "t" })).rejects.toMatchObject({ status: 401 });
    await withSystem((tx) => tx`update users set failed_login_count = 9 where email = ${email}`);
    await expect(login({ email, password: "fout-wachtwoord-1" }, { ip: "1.1.1.4", userAgent: "t" })).rejects.toMatchObject({ status: 401 });
    await expect(login({ email, password: "Blauwe-Fiets-2026" }, { ip: "1.1.1.5", userAgent: "t" })).rejects.toMatchObject({ status: 423 });
    process.env.ALLOW_SIGNUP = "false";
    resetEnvCache();
  });

  it("beperkt het aantal verzoeken (rate limiting)", async () => {
    const key = `test-${Date.now()}`;
    for (let i = 0; i < 3; i++) await rateLimit(key, 3, 60);
    await expect(rateLimit(key, 3, 60)).rejects.toBeInstanceOf(ApiError);
  });
});

describe("tools en goedkeuringen", () => {
  it("dwingt rollen, schema's en agentrechten af", async () => {
    const s = await setup("viewer");
    const r1 = await executeTool({ ctx: s.ctx, role: "viewer", toolKey: "records_create", input: { collection: "klanten", title: "x", data: {} }, actor: { type: "user", id: s.user.id } });
    expect(r1.status).toBe("rejected");
    const r2 = await executeTool({ ctx: s.ownerCtx, role: "owner", toolKey: "calculator", input: { wrong: 1 }, actor: { type: "user" } });
    expect(r2.status).toBe("failed");
    expect(r2.error).toMatch(/ontbrekend veld: expression/);
    const r3 = await executeTool({ ctx: s.ownerCtx, role: "owner", toolKey: "calculator", input: { expression: "6*7" }, actor: { type: "user" } });
    expect(r3).toMatchObject({ status: "succeeded", output: { result: 42 } });
  });

  it("beperkt agents tot hun eigen tools en datacollecties", async () => {
    const s = await setup();
    await installCleanPack(s.ownerCtx, { provider: "demo", modelId: "demo-simulator" });
    const [crm] = await withTenant(s.ownerCtx, (tx) => tx<{ id: string }[]>`select id from agents where key = 'crm_agent'`);
    const policy = (await loadAgentPolicy(s.ownerCtx, crm.id))!;
    const actor = { type: "agent" as const, id: crm.id, agent: policy };
    const ok = await executeTool({ ctx: s.ownerCtx, role: "owner", toolKey: "records_create", input: { collection: "klanten", title: "Klant X", data: {} }, actor });
    expect(ok.status).toBe("succeeded");
    const scope = await executeTool({ ctx: s.ownerCtx, role: "owner", toolKey: "records_create", input: { collection: "personeel", title: "x", data: {} }, actor });
    expect(scope).toMatchObject({ status: "rejected" });
    expect(scope.error).toMatch(/geen toegang tot de collectie "personeel"/);
    const tool = await executeTool({ ctx: s.ownerCtx, role: "owner", toolKey: "calculator", input: { expression: "1+1" }, actor });
    expect(tool.error).toMatch(/geen toegang tot tool/);
  });

  it("laat gevoelige acties wachten op goedkeuring en voert ze daarna uit", async () => {
    const s = await setup();
    const [rec] = await withTenant(s.ownerCtx, (tx) => tx<{ id: string }[]>`insert into records (org_id, collection, title) values (app_org_id(), 'klanten', 'Te verwijderen') returning id`);
    const pending = await executeTool({ ctx: s.ownerCtx, role: "owner", toolKey: "records_delete", input: { id: rec.id, reason: "test" }, actor: { type: "user" } });
    expect(pending.status).toBe("pending_approval");
    expect(await withTenant(s.ownerCtx, (tx) => tx`select id from records where id = ${rec.id}`)).toHaveLength(1);
    const d = await decideApproval(s.ownerCtx, "owner", pending.approvalId!, true, "akkoord");
    expect(d.execution?.status).toBe("succeeded");
    expect(await withTenant(s.ownerCtx, (tx) => tx`select id from records where id = ${rec.id}`)).toHaveLength(0);
    await expect(decideApproval(s.ownerCtx, "owner", pending.approvalId!, true)).rejects.toMatchObject({ status: 409 });
  });

  it("voert afgewezen acties niet uit", async () => {
    const s = await setup();
    const [rec] = await withTenant(s.ownerCtx, (tx) => tx<{ id: string }[]>`insert into records (org_id, collection, title) values (app_org_id(), 'klanten', 'Blijft') returning id`);
    const pending = await executeTool({ ctx: s.ownerCtx, role: "owner", toolKey: "records_delete", input: { id: rec.id, reason: "x" }, actor: { type: "user" } });
    await decideApproval(s.ownerCtx, "owner", pending.approvalId!, false, "nee");
    expect(await withTenant(s.ownerCtx, (tx) => tx`select id from records where id = ${rec.id}`)).toHaveLength(1);
    const [e] = await withTenant(s.ownerCtx, (tx) => tx`select status from tool_executions where id = ${pending.executionId}`);
    expect(e.status).toBe("rejected");
  });
});

describe("RAG-kennisbank", () => {
  it("verwerkt documenten en vindt relevante fragmenten; meldt geen treffers bij ontbrekende info", async () => {
    const s = await setup();
    const text = "Klachtenprocedure\n\nKlachten worden binnen 24 uur opgevolgd door de kwaliteitsmedewerker.\n\nGlasbewassing gebeurt elke vier weken.";
    const docId = await withTenant(s.ownerCtx, async (tx) => {
      const [kb] = await tx<{ id: string }[]>`select id from knowledge_bases limit 1`;
      const [d] = await tx<{ id: string }[]>`insert into documents (org_id, knowledge_base_id, title, filename, mime_type, size_bytes, sha256)
        values (app_org_id(), ${kb.id}, 'Procedures', 'p.txt', 'text/plain', ${text.length}, ${sha256(text)}) returning id`;
      await tx`insert into document_blobs (document_id, org_id, data) values (${d.id}, app_org_id(), ${Buffer.from(text)})`;
      return d.id;
    });
    const r = await processDocument(s.ownerCtx, docId);
    expect(r.chunks).toBeGreaterThan(0);
    const hits = await searchKnowledge(s.ownerCtx, { query: "Hoe snel worden klachten opgevolgd?" });
    expect(hits[0]?.content).toMatch(/24 uur/);
    const none = await searchKnowledge(s.ownerCtx, { query: "parkeerbeleid directiekamer" });
    expect(none).toHaveLength(0);
  });
});

describe("LLM Studio-chat", () => {
  it("bewaart berichten, voert tools uit en registreert verbruik", async () => {
    const s = await setup();
    const [conv] = await withTenant(s.ownerCtx, (tx) => tx<{ id: string }[]>`
      insert into conversations (org_id, user_id, provider, model_id, tool_keys) values (app_org_id(), app_user_id(), 'demo', 'demo-simulator', ${["calculator"]}) returning id`);
    const events: ChatEvent[] = [];
    await runConversationTurn({ ctx: s.ownerCtx, role: "owner", conversationId: conv.id, userContent: '/tool calculator {"expression":"21*2"}', emit: (e) => { events.push(e); } });
    expect(events.some((e) => e.type === "tool_result")).toBe(true);
    const msgs = await withTenant(s.ownerCtx, (tx) => tx<{ role: string }[]>`select role from messages where conversation_id = ${conv.id} order by created_at`);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant", "tool", "assistant"]);
    const [u] = await withTenant(s.ownerCtx, (tx) => tx<{ n: number }[]>`select count(*)::int as n from usage_events where source = 'chat'`);
    expect(u.n).toBe(2);
  });

  it("meldt duidelijk dat een API-sleutel ontbreekt", async () => {
    const s = await setup();
    const [conv] = await withTenant(s.ownerCtx, (tx) => tx<{ id: string }[]>`
      insert into conversations (org_id, user_id, provider, model_id) values (app_org_id(), app_user_id(), 'anthropic', 'claude-opus-5-5') returning id`);
    const events: ChatEvent[] = [];
    await runConversationTurn({ ctx: s.ownerCtx, role: "owner", conversationId: conv.id, userContent: "Hallo", emit: (e) => { events.push(e); } });
    const err = events.find((e) => e.type === "error") as Extract<ChatEvent, { type: "error" }>;
    expect(err.error).toMatch(/nog geen API-sleutel voor Anthropic/);
    expect(err.setup?.provider).toBe("anthropic");
  });
});

describe("agents, orchestratie, workflows en apps", () => {
  it("voert de gecontroleerde agentcyclus uit en logt alle fases", async () => {
    const s = await setup();
    await installCleanPack(s.ownerCtx, { provider: "demo", modelId: "demo-simulator" });
    const [agent] = await withTenant(s.ownerCtx, (tx) => tx<{ id: string }[]>`select id from agents where key = 'offerte_agent'`);
    const { runId } = await startAgentTask(s.ownerCtx, { agentId: agent.id, title: "Rekentest", instructions: '/tool calculator {"expression":"300*0.85"}' });
    await drainJobs();
    const [run] = await withTenant(s.ownerCtx, (tx) => tx`select status, output from agent_runs where id = ${runId}`);
    expect(run.status).toBe("succeeded");
    const phases = (await withTenant(s.ownerCtx, (tx) => tx<{ phase: string }[]>`select phase from agent_run_steps where run_id = ${runId} order by id`)).map((p) => p.phase);
    expect(phases).toEqual(expect.arrayContaining(["understand", "plan", "tool_select", "act", "verify", "final"]));
    const [a] = await withTenant(s.ownerCtx, (tx) => tx`select status from agents where id = ${agent.id}`);
    expect(a.status).toBe("idle");
  });

  it("stopt bij het maximum aantal stappen", async () => {
    const s = await setup();
    await installCleanPack(s.ownerCtx, { provider: "demo", modelId: "demo-simulator" });
    const [agent] = await withTenant(s.ownerCtx, (tx) => tx<{ id: string }[]>`update agents set max_steps = 1 where key = 'offerte_agent' returning id`);
    const { runId } = await startAgentTask(s.ownerCtx, { agentId: agent.id, title: "Limiet", instructions: '/tool calculator {"expression":"1+1"}' });
    await drainJobs();
    const [run] = await withTenant(s.ownerCtx, (tx) => tx`select status, error from agent_runs where id = ${runId}`);
    expect(run.status).toBe("limit_reached");
    expect(run.error).toMatch(/Maximaal 1 stappen/);
  });

  it("orchestreert meerdere agents met afhankelijkheden en eindrapport", async () => {
    const s = await setup();
    await installCleanPack(s.ownerCtx, { provider: "demo", modelId: "demo-simulator" });
    const id = await createOrchestration(s.ownerCtx, { goal: "Registreer klant en maak offerte", provider: "demo", modelId: "demo-simulator" });
    await drainJobs();
    const [o] = await withTenant(s.ownerCtx, (tx) => tx`select status, final_report from orchestrations where id = ${id}`);
    expect(o.status).toBe("completed");
    expect(o.final_report).toBeTruthy();
    const tasks = await withTenant(s.ownerCtx, (tx) => tx<{ status: string; input: { dependency_results?: unknown[] } }[]>`select status, input from agent_tasks where orchestration_id = ${id} order by created_at`);
    expect(tasks.length).toBeGreaterThanOrEqual(2);
    expect(tasks.every((t) => t.status === "succeeded")).toBe(true);
    expect(tasks[1].input.dependency_results).toHaveLength(1);
  });

  it("deelt resultaten niet met agents zonder toestemming", async () => {
    const s = await setup();
    await installCleanPack(s.ownerCtx, { provider: "demo", modelId: "demo-simulator" });
    // CRM (t1) mag in deze test alleen met de directie delen; de tweede agent mag het resultaat dus niet zien.
    await withTenant(s.ownerCtx, (tx) => tx`update agents set share_with = '{}' where key = 'crm_agent'`);
    const id = await createOrchestration(s.ownerCtx, { goal: "Deeltest", provider: "demo", modelId: "demo-simulator" });
    await drainJobs();
    const tasks = await withTenant(s.ownerCtx, (tx) => tx<{ input: { dependency_results?: { result: string }[] } }[]>`select input from agent_tasks where orchestration_id = ${id} order by created_at`);
    expect(tasks[1].input.dependency_results?.[0].result).toMatch(/Niet gedeeld/);
  });

  it("voert de Clean-offerteworkflow uit tot en met goedkeuring en e-mailconcept", async () => {
    const s = await setup();
    await installCleanPack(s.ownerCtx, { provider: "demo", modelId: "demo-simulator" });
    const [wf] = await withTenant(s.ownerCtx, (tx) => tx<{ id: string }[]>`select id from workflows limit 1`);
    const runId = await startWorkflowRun(s.ownerCtx, wf.id, { klant: "Test BV", email: "test@voorbeeld.nl", omschrijving: "Kantoor 200 m2" });
    await drainJobs();
    let [run] = await withTenant(s.ownerCtx, (tx) => tx`select status from workflow_runs where id = ${runId}`);
    expect(run.status).toBe("waiting_approval");
    const [ap] = await withTenant(s.ownerCtx, (tx) => tx<{ id: string }[]>`select id from approval_requests where workflow_run_id = ${runId} and status = 'pending'`);
    await decideApproval(s.ownerCtx, "owner", ap.id, true);
    await drainJobs();
    [run] = await withTenant(s.ownerCtx, (tx) => tx`select status from workflow_runs where id = ${runId}`);
    expect(run.status).toBe("completed");
    const drafts = await withTenant(s.ownerCtx, (tx) => tx<{ data: { to: string } }[]>`select data from records where collection = 'email_concepten'`);
    expect(drafts[0].data.to).toBe("test@voorbeeld.nl");
  });

  it("weigert een concept-app voor gewone gebruikers en valideert invoer", async () => {
    const s = await setup("member");
    const [app] = await withTenant(s.ownerCtx, (tx) => tx<{ id: string }[]>`
      insert into ai_apps (org_id, name, slug, app_type, config) values (app_org_id(), 'Test', 'test', 'chatbot',
        ${tx.json({ provider: "demo", modelId: "demo-simulator", promptId: null, systemPrompt: "", userTemplate: "{{vraag}}", inputFields: [{ name: "vraag", label: "Vraag", type: "textarea", required: true }], knowledgeBaseIds: [], toolKeys: [], output: { format: "text" } })})
      returning id`);
    await expect(runApp(s.ctx, "member", app.id, { vraag: "x" }, { allowDraft: false })).rejects.toMatchObject({ status: 403 });
    await withTenant(s.ownerCtx, (tx) => tx`update ai_apps set status = 'published' where id = ${app.id}`);
    await expect(runApp(s.ctx, "member", app.id, {}, { allowDraft: false })).rejects.toMatchObject({ status: 400 });
    const r = await runApp(s.ctx, "member", app.id, { vraag: "Hallo" }, { allowDraft: false });
    expect(r.status).toBe("succeeded");
  });
});

describe("job queue", () => {
  it("probeert mislukte jobs opnieuw met backoff en markeert ze daarna als definitief mislukt", async () => {
    const s = await setup();
    await withTenant(s.ownerCtx, (tx) => enqueue(tx, "retention.purge", {}, { maxAttempts: 1 }));
    const job = await claimJob();
    expect(job).not.toBeNull();
    expect(await failJob(job!, "test")).toBe(true);
    const [row] = await withSystem((tx) => tx`select status from jobs where id = ${job!.id}`);
    expect(row.status).toBe("dead");
  });
});
