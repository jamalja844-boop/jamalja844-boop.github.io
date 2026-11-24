import { orgHandler } from "@/lib/api/handler";
import { withTenant } from "@/lib/db";

/** Mijn gegenereerde bestanden en bijlagen (privé per gebruiker). */
export const GET = orgHandler({ permission: "cowork.use" }, async ({ ctx }) => {
  return withTenant(ctx.tenant, async (tx) => ({
    files: await tx`
      select f.id, f.filename, f.format, f.size_bytes, f.source, f.conversation_id, f.created_at, c.title as conversation_title
        from cowork_files f left join conversations c on c.id = f.conversation_id order by f.created_at desc limit 300`,
    attachments: await tx`
      select a.id, a.filename, a.file_type, a.size_bytes, a.pages, a.chars, a.injection_flags, a.conversation_id, a.created_at, c.title as conversation_title
        from chat_attachments a left join conversations c on c.id = a.conversation_id order by a.created_at desc limit 300`,
  }));
});
