import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/auth/context";
import { withTenant } from "@/lib/db";
import { ApiError } from "@/lib/api/errors";
import { serialize } from "@/lib/utils";
import { getProject, sandboxStatus } from "@/lib/code/projects";
import { studioOptions } from "@/lib/studio-options";
import { ProjectWorkspace } from "@/components/code/project-workspace";

export const metadata = { title: "AI Code – project" };

export default async function ProjectPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const ctx = await requireOrg(org, "code.use");
  const data = await withTenant(ctx.tenant, async (tx) => {
    try {
      const project = await getProject(tx, id);
      await tx`update code_projects set last_opened_at = now() where id = ${id}`;
      const tasks = await tx`select id, prompt, status, created_at, changed_files from code_tasks where project_id = ${id} order by created_at desc limit 30`;
      const commands = await tx`
        select id, task_id, command, network, exit_code, duration_ms, timed_out, created_at, right(stdout, 4000) as stdout, right(stderr, 4000) as stderr
          from code_commands where project_id = ${id} order by created_at desc limit 30`;
      return { project, tasks, commands };
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  });
  if (!data) notFound();
  const [sandbox, options] = await Promise.all([sandboxStatus(), studioOptions(ctx.tenant, ctx.role)]);
  const models = options.models.filter((m) => m.supports_tools).map((m) => ({ value: `${m.provider}::${m.model_id}`, label: m.display_name, available: m.available }));
  const s = serialize(data);
  return (
    <Suspense>
      <ProjectWorkspace
        slug={org}
        project={s.project}
        initialTasks={s.tasks as never}
        initialCommands={s.commands as never}
        sandbox={sandbox}
        models={models}
      />
    </Suspense>
  );
}
