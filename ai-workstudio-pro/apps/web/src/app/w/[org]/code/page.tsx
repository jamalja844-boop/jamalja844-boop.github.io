import { requireOrg } from "@/lib/auth/context";
import { withTenant } from "@/lib/db";
import { env } from "@/lib/env";
import { serialize } from "@/lib/utils";
import { sandboxStatus } from "@/lib/code/projects";
import { ProjectsOverview, type ProjectSummary } from "@/components/code/projects-overview";

export const metadata = { title: "AI Code" };

export default async function CodePage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireOrg(org, "code.use");
  const [projects, sandbox] = await Promise.all([
    withTenant(ctx.tenant, (tx) => tx<ProjectSummary[]>`
      select p.id, p.name, p.description, p.source_type, p.source_ref, p.status, p.error, p.created_at, p.last_opened_at,
             (select count(*)::int from code_tasks t where t.project_id = p.id) as task_count,
             (select t.status from code_tasks t where t.project_id = p.id order by t.created_at desc limit 1) as last_task_status
        from code_projects p order by coalesce(p.last_opened_at, p.created_at) desc`),
    sandboxStatus(),
  ]);
  return (
    <ProjectsOverview
      slug={org}
      initialProjects={serialize(projects) as unknown as ProjectSummary[]}
      sandbox={sandbox}
      canManage={ctx.can("code.manage")}
      allowedHosts={env().GIT_ALLOWED_HOSTS.split(",").map((h) => h.trim()).filter(Boolean)}
    />
  );
}
