import { z } from "zod";
import { gitOps } from "@workstudio/code-execution";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/security/audit";
import { codeOp, openProject } from "@/lib/code/projects";

type P = { org: string; id: string };

export const GET = orgHandler<P>({ permission: "code.use" }, async ({ ctx, params }) => {
  const projectId = z.string().uuid().parse(params.id);
  const { dir } = await openProject(ctx.tenant, projectId);
  return codeOp(async () => {
    const [status, diff, branches, log] = [await gitOps.status(dir), await gitOps.diff(dir), await gitOps.branches(dir), await gitOps.log(dir)];
    return { status, diff, branches, log };
  });
});

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("commit"), message: z.string().trim().min(1).max(500) }),
  z.object({ action: z.literal("branch"), name: z.string().trim().min(1).max(80) }),
  z.object({ action: z.literal("checkout"), name: z.string().trim().min(1).max(80) }),
]);

/** Lokale Git-acties in de projectmap. Pushen naar GitHub volgt in de GitHub-koppeling (fase 2-uitbreiding). */
export const POST = orgHandler<P>({ permission: "code.use", rate: { name: "code-git", limit: 60, windowSec: 60 } }, async ({ req, ctx, params }) => {
  const projectId = z.string().uuid().parse(params.id);
  const input = await parseJson(req, schema);
  const { dir } = await openProject(ctx.tenant, projectId);
  const result = await codeOp(async () => {
    if (input.action === "commit") return { hash: await gitOps.commitAll(dir, input.message, { name: ctx.user.name, email: ctx.user.email }) };
    if (input.action === "branch") return { branch: (await gitOps.createBranch(dir, input.name), input.name) };
    await gitOps.checkout(dir, input.name);
    return { branch: input.name };
  });
  await withTenant(ctx.tenant, (tx) => audit(tx, { action: `code.git_${input.action}`, targetType: "code_project", targetId: projectId, metadata: { ...input } }));
  return result;
});
