import { z } from "zod";
import { orgHandler } from "@/lib/api/handler";
import { ndjsonResponse } from "@/lib/api/stream";
import { runConversationTurn } from "@/lib/chat/engine";

export const maxDuration = 300;

/** Gaat verder na een goedkeuringsbesluit: verwerkt tool-resultaten en laat het model reageren. */
export const POST = orgHandler<{ org: string; id: string }>(
  { permission: "chat.use", rate: { name: "chat", limit: 40, windowSec: 60 } },
  async ({ req, ctx, params }) => {
    const conversationId = z.string().uuid().parse(params.id);
    return ndjsonResponse((emit) => runConversationTurn({ ctx: ctx.tenant, role: ctx.role, conversationId, emit, signal: req.signal }));
  },
);
