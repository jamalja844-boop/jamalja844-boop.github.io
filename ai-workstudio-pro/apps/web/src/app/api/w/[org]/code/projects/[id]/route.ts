import { z } from "zod";
import { orgHandler } from "@/lib/api/handler";
import { withTenant } from "@/lib/db";
import { deleteProject, getProject, sandboxStatus } from "@/lib/code/projects";

type P = { org: string; id: string };

export const GET = orgHandler<P>({ permission: "code.use" }, async ({ ctx, params }) => {
  const projectId = z.string().uuid().parse(params.id);
  const data = await withTenant(ctx.tenant, async (tx) => {
    const project = await getProject(tx, projectId);
    await tx`update code_projects set last_opened_at = now() where id = ${projectId}`;
    const tasks = await tx`
      select id, prompt, status, provider, model_id, changed_files, iterations, cost_usd, created_at, finished_at
        from code_tasks where project_id = ${projectId} order by created_at desc limit 30`;
    const commands = await tx`
      select id, task_id, command, network, exit_code, duration_ms, timed_out, created_at, right(stdout, 4000) as stdout, right(stderr, 4000) as stderr
        from code_commands where project_id = ${projectId} order by created_at desc limit 30`;
    return { project, tasks, commands };
  });
  return { ...data, sandbox: await sandboxStatus() };
});

export const DELETE = orgHandler<P>({ permission: "code.manage" }, async ({ ctx, params }) => {
  const projectId = z.string().uuid().parse(params.id);
  await deleteProject(ctx.tenant, projectId);
  return { ok: true };
});
