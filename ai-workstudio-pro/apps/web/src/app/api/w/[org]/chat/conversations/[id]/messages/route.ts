import { z } from "zod";
import { parseSlashCommand } from "@workstudio/shared";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { ndjsonResponse } from "@/lib/api/stream";
import { withTenant } from "@/lib/db";
import { runConversationTurn } from "@/lib/chat/engine";
import { runChatCommand } from "@/lib/chat/commands";
import { writingContext } from "@/lib/writing/service";

export const maxDuration = 300;

const schema = z.object({ content: z.string().trim().min(1, "Bericht is leeg").max(60_000) });

/**
 * Bericht in AI Chat. Slash-opdrachten (/email, /translate, /code …) gaan naar hun eigen
 * handler; gewone berichten lopen via de chatmotor met schrijfstijl en persoonlijke instructies.
 */
export const POST = orgHandler<{ org: string; id: string }>(
  { permission: "chat.use", rate: { name: "chat", limit: 40, windowSec: 60 } },
  async ({ req, ctx, params }) => {
    const conversationId = z.string().uuid().parse(params.id);
    const { content } = await parseJson(req, schema, 400_000);
    const conv = await withTenant(ctx.tenant, async (tx) => {
      const [c] = await tx<{ id: string; style_id: string | null }[]>`
        select id, style_id from conversations where id = ${conversationId} and kind = 'chat' and user_id = app_user_id()`;
      return c;
    });
    if (!conv) throw notFound("Gesprek");
    const command = parseSlashCommand(content);
    if (command) {
      return ndjsonResponse((emit) => runChatCommand({ ctx, conversationId, raw: content, command, emit, signal: req.signal }));
    }
    const { system } = await withTenant(ctx.tenant, (tx) => writingContext(tx, conv.style_id));
    const extraSystem = `Je bent de AI-assistent van AI WorkStudio Pro. Antwoord behulpzaam, concreet en eerlijk; zeg het als je iets niet weet.\n\n${system}`;
    return ndjsonResponse((emit) =>
      runConversationTurn({ ctx: ctx.tenant, role: ctx.role, conversationId, userContent: content, emit, signal: req.signal, extraSystem }),
    );
  },
);
