import { Suspense } from "react";
import { requireOrg } from "@/lib/auth/context";
import { withTenant } from "@/lib/db";
import { studioOptions } from "@/lib/studio-options";
import { serialize } from "@/lib/utils";
import { getUserPrefs, listStyles } from "@/lib/writing/service";
import { ChatWorkspace } from "@/components/chat/chat-workspace";

export const metadata = { title: "AI Chat" };

export default async function ChatPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireOrg(org, "chat.use");
  const canCode = ctx.can("code.use");
  const [options, data] = await Promise.all([
    studioOptions(ctx.tenant, ctx.role),
    withTenant(ctx.tenant, async (tx) => {
      const conversations = await tx<{ id: string; title: string; provider: string; model_id: string; style_id: string | null; project_id: string | null; project_name: string | null; pinned: boolean; updated_at: Date }[]>`
        select c.id, c.title, c.provider, c.model_id, c.style_id, c.project_id, p.name as project_name, c.pinned, c.updated_at
          from conversations c left join code_projects p on p.id = c.project_id
         where c.kind = 'chat' and c.user_id = app_user_id() order by c.pinned desc, c.updated_at desc limit 200`;
      const styles = await listStyles(tx);
      const prefs = await getUserPrefs(tx);
      const projects = canCode
        ? await tx<{ id: string; name: string; status: string }[]>`select id, name, status from code_projects order by coalesce(last_opened_at, created_at) desc limit 50`
        : [];
      return { conversations, styles, prefs, projects };
    }),
  ]);
  return (
    <Suspense>
      <ChatWorkspace
        slug={org}
        options={options}
        styles={data.styles}
        projects={data.projects}
        initialConversations={serialize(data.conversations)}
        canCode={canCode}
        defaultStyleId={data.prefs.default_style_id}
      />
    </Suspense>
  );
}
