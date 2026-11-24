import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { ndjsonResponse } from "@/lib/api/stream";
import { runConversationTurn } from "@/lib/chat/engine";

export const maxDuration = 300;

const schema = z.object({ content: z.string().trim().min(1, "Bericht is leeg").max(30_000) });

export const POST = orgHandler<{ org: string; id: string }>(
  { permission: "chat.use", rate: { name: "chat", limit: 40, windowSec: 60 } },
  async ({ req, ctx, params }) => {
    const conversationId = z.string().uuid().parse(params.id);
    const { content } = await parseJson(req, schema, 200_000);
    return ndjsonResponse((emit) =>
      runConversationTurn({ ctx: ctx.tenant, role: ctx.role, conversationId, userContent: content, emit, signal: req.signal }),
    );
  },
);
