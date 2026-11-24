import { createProjectSchema } from "@workstudio/shared";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { withTenant } from "@/lib/db";
import { createProject, sandboxStatus } from "@/lib/code/projects";

export const GET = orgHandler({ permission: "code.use" }, async ({ ctx }) => {
  const [projects, sandbox] = await Promise.all([
    withTenant(ctx.tenant, (tx) => tx`
      select p.id, p.name, p.description, p.source_type, p.source_ref, p.status, p.error, p.created_at, p.updated_at, p.last_opened_at,
             (select count(*)::int from code_tasks t where t.project_id = p.id) as task_count,
             (select t.status from code_tasks t where t.project_id = p.id order by t.created_at desc limit 1) as last_task_status
        from code_projects p order by coalesce(p.last_opened_at, p.created_at) desc`),
    sandboxStatus(),
  ]);
  return { projects, sandbox };
});

export const POST = orgHandler({ permission: "code.manage", rate: { name: "code-project", limit: 20, windowSec: 300 } }, async ({ req, ctx }) => {
  const input = await parseJson(req, createProjectSchema);
  const id = await createProject(ctx.tenant, input);
  return { id };
});
