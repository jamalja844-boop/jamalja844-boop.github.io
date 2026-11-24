import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { createInvitation, emailSchema } from "@/lib/auth/service";

const schema = z.object({ email: emailSchema, role: z.enum(["admin", "developer", "member", "viewer"]) });

/** Nodigt een gebruiker uit (eenmalige link, 7 dagen geldig). */
export const POST = orgHandler({ permission: "members.manage", rate: { name: "invite", limit: 30, windowSec: 3600 } }, async ({ req, ctx }) => {
  const input = await parseJson(req, schema);
  const inv = await createInvitation(ctx.tenant, input.email, input.role);
  return { url: inv.url };
});
