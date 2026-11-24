import { afterAll, describe, expect, it } from "vitest";
import { closeDb, withSystem, withTenant, withUser } from "@/lib/db";
import { addMember, createUser, setup } from "./helpers";

afterAll(() => closeDb());

describe("Row Level Security – organisatiescheiding", () => {
  it("organisatie B ziet geen gegevens van organisatie A", async () => {
    const a = await setup();
    const b = await setup();
    await withTenant(a.ctx, (tx) => tx`insert into records (org_id, collection, title) values (app_org_id(), 'klanten', 'Geheime klant A')`);
    await withTenant(a.ctx, (tx) => tx`insert into prompts (org_id, name, created_by) values (app_org_id(), 'Prompt A', app_user_id())`);

    const seenByB = await withTenant(b.ctx, (tx) => tx`select title from records`);
    expect(seenByB).toHaveLength(0);
    // Zelfs zonder WHERE-filter of met een expliciete org_id van A: niets zichtbaar.
    const direct = await withTenant(b.ctx, (tx) => tx`select title from records where org_id = ${a.org.id}`);
    expect(direct).toHaveLength(0);
    const prompts = await withTenant(b.ctx, (tx) => tx`select name from prompts`);
    expect(prompts.map((p) => p.name)).not.toContain("Prompt A");
  });

  it("weigert schrijven naar een andere organisatie", async () => {
    const a = await setup();
    const b = await setup();
    await expect(withTenant(b.ctx, (tx) => tx`insert into records (org_id, collection, title) values (${a.org.id}, 'klanten', 'inbraak')`)).rejects.toMatchObject({ code: "42501" });
    const [rec] = await withTenant(a.ctx, (tx) => tx<{ id: string }[]>`insert into records (org_id, collection, title) values (app_org_id(), 'klanten', 'A') returning id`);
    const updated = await withTenant(b.ctx, (tx) => tx`update records set title = 'gehackt' where id = ${rec.id} returning id`);
    expect(updated).toHaveLength(0);
  });

  it("weigert toegang als de gebruiker geen lid is van de organisatie", async () => {
    const a = await setup();
    const stranger = await createUser("Vreemde");
    await withTenant(a.ctx, (tx) => tx`insert into records (org_id, collection, title) values (app_org_id(), 'klanten', 'A')`);
    const rows = await withTenant({ orgId: a.org.id, userId: stranger.id }, (tx) => tx`select id from records`);
    expect(rows).toHaveLength(0);
  });

  it("houdt gesprekken privé tussen collega's", async () => {
    const a = await setup();
    const colleague = await createUser("Collega");
    await addMember(a.org.id, colleague.id, "admin");
    await withTenant(a.ctx, (tx) => tx`insert into conversations (org_id, user_id, provider, model_id) values (app_org_id(), app_user_id(), 'demo', 'demo-simulator')`);
    const seen = await withTenant({ orgId: a.org.id, userId: colleague.id }, (tx) => tx`select id from conversations`);
    expect(seen).toHaveLength(0);
  });

  it("past toegangsrechten op documentniveau toe", async () => {
    const a = await setup();
    const viewer = await createUser("Kijker");
    await addMember(a.org.id, viewer.id, "viewer");
    await withTenant(a.ctx, async (tx) => {
      const [kb] = await tx<{ id: string }[]>`select id from knowledge_bases limit 1`;
      await tx`insert into documents (org_id, knowledge_base_id, title, filename, mime_type, size_bytes, sha256, min_role)
               values (app_org_id(), ${kb.id}, 'Salarissen', 's.txt', 'text/plain', 1, 'x1', 'admin'),
                      (app_org_id(), ${kb.id}, 'Werkinstructie', 'w.txt', 'text/plain', 1, 'x2', 'viewer')`;
    });
    const docs = await withTenant({ orgId: a.org.id, userId: viewer.id }, (tx) => tx<{ title: string }[]>`select title from documents`);
    expect(docs.map((d) => d.title)).toEqual(["Werkinstructie"]);
  });

  it("maakt wachtwoordhashes en sessies onleesbaar voor de applicatierol", async () => {
    const a = await setup();
    await expect(withTenant(a.ctx, (tx) => tx`select password_hash from users`)).rejects.toMatchObject({ code: "42501" });
    await expect(withTenant(a.ctx, (tx) => tx`select * from sessions`)).rejects.toMatchObject({ code: "42501" });
    const me = await withTenant(a.ctx, (tx) => tx`select id, email, name from users where id = app_user_id()`);
    expect(me).toHaveLength(1);
  });

  it("houdt het auditlog append-only en alleen leesbaar voor beheerders", async () => {
    const a = await setup("member");
    await withTenant(a.ctx, (tx) => tx`insert into audit_logs (org_id, actor_user_id, action) values (app_org_id(), app_user_id(), 'test')`);
    await expect(withTenant(a.ctx, (tx) => tx`delete from audit_logs`)).rejects.toMatchObject({ code: "42501" });
    expect(await withTenant(a.ctx, (tx) => tx`select id from audit_logs`)).toHaveLength(0);
    expect((await withTenant(a.ownerCtx, (tx) => tx`select id from audit_logs where action = 'test'`)).length).toBe(1);
  });

  it("laat alleen beheerders credentials wijzigen", async () => {
    const a = await setup("member");
    await expect(withTenant(a.ctx, (tx) => tx`insert into credentials (org_id, kind, provider, encrypted_value) values (app_org_id(), 'llm', 'openai', 'x')`)).rejects.toMatchObject({ code: "42501" });
    await withTenant(a.ownerCtx, (tx) => tx`insert into credentials (org_id, kind, provider, encrypted_value) values (app_org_id(), 'llm', 'openai', 'x')`);
    expect(await withTenant(a.ctx, (tx) => tx`update credentials set encrypted_value = 'y' returning id`)).toHaveLength(0);
  });

  it("toont een gebruiker alleen zijn eigen workspaces", async () => {
    const a = await setup();
    await setup();
    const orgs = await withUser(a.owner.id, (tx) => tx`select id from organizations`);
    expect(orgs.map((o) => o.id)).toEqual([a.org.id]);
    const total = await withSystem((tx) => tx<{ n: number }[]>`select count(*)::int as n from organizations`);
    expect(total[0].n).toBeGreaterThan(1);
  });
});
