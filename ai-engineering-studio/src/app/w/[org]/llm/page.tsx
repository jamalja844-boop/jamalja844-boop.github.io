import { Suspense } from "react";
import { requireOrg } from "@/lib/auth/context";
import { withTenant } from "@/lib/db";
import { studioOptions } from "@/lib/studio-options";
import { serialize } from "@/lib/utils";
import { ChatStudio } from "@/components/chat/chat-studio";

export const metadata = { title: "LLM Studio" };

export default async function LlmStudioPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireOrg(org, "chat.use");
  const [options, conversations] = await Promise.all([
    studioOptions(ctx.tenant, ctx.role),
    withTenant(ctx.tenant, (tx) => tx<{ id: string; title: string; provider: string; model_id: string; total_cost_usd: string; tokens: number; updated_at: Date }[]>`
      select id, title, provider, model_id, total_cost_usd, (total_input_tokens + total_output_tokens)::int as tokens, updated_at
        from conversations order by pinned desc, updated_at desc limit 100`),
  ]);
  return (
    <Suspense>
      <ChatStudio slug={org} options={options} initialConversations={serialize(conversations)} canDecide={ctx.can("approvals.decide")} />
    </Suspense>
  );
}
