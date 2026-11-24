import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { codeOp, openPullRequest, pushToGithub } from "@/lib/code/projects";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("push"), confirm: z.literal(true), allowDefaultBranch: z.boolean().default(false) }),
  z.object({
    action: z.literal("pull_request"), confirm: z.literal(true),
    title: z.string().trim().min(3).max(200), body: z.string().max(20_000).default(""), draft: z.boolean().default(true),
  }),
]);

/** Pushen en pull requests: externe acties, alleen met expliciete bevestiging (confirm: true) en auditlog. */
export const POST = orgHandler<{ org: string; id: string }>(
  { permission: "code.use", rate: { name: "gh-push", limit: 20, windowSec: 600 } },
  async ({ req, ctx, params }) => {
    const projectId = z.string().uuid().parse(params.id);
    const input = await parseJson(req, schema);
    if (input.action === "push") return codeOp(() => pushToGithub(ctx.tenant, projectId, input));
    return codeOp(() => openPullRequest(ctx.tenant, projectId, input));
  },
);
