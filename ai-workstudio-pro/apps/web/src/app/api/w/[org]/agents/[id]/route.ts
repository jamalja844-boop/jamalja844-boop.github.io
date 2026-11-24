import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/security/audit";
import { agentSchema, saveAgent } from "@/lib/agents/service";

type P = { org: string; id: string };

export const PUT = orgHandler<P>({ permission: "agents.manage" }, async ({ req, ctx, params }) => {
  const id = z.string().uuid().parse(params.id);
  const input = await parseJson(req, agentSchema, 300_000);
  await withTenant(ctx.tenant, async (tx) => {
    await saveAgent(tx, id, input);
    await audit(tx, { action: "agent.updated", targetType: "agent", targetId: id, metadata: { key: input.key, tools: input.toolKeys, dataScopes: input.dataScopes, shareWith: input.shareWith } });
  });
  return { id };
});

export const DELETE = orgHandler<P>({ permission: "agents.manage" }, async ({ ctx, params }) => {
  const id = z.string().uuid().parse(params.id);
  await withTenant(ctx.tenant, async (tx) => {
    const [a] = await tx`delete from agents where id = ${id} returning key`;
    if (!a) throw notFound("Agent");
    await audit(tx, { action: "agent.deleted", targetType: "agent", targetId: id, metadata: { key: a.key } });
  });
  return { ok: true };
});
