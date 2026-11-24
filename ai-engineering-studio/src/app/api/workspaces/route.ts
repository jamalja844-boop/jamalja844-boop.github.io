import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { parseJson, publicHandler, userFromRequest } from "@/lib/api/handler";
import { withSystem } from "@/lib/db";
import { createOrganization, slugify } from "@/lib/orgs/service";
import { rateLimit } from "@/lib/security/ratelimit";
import { randomToken } from "@/lib/security/crypto";

const schema = z.object({ name: z.string().trim().min(2).max(80), description: z.string().max(500).optional() });

export const POST = publicHandler(async ({ req }) => {
  const user = await userFromRequest(req);
  if (!user) throw new ApiError(401, "Je bent niet ingelogd");
  await rateLimit(`workspace-create:${user.id}`, 10, 3600);
  const input = await parseJson(req, schema);
  const slug = await withSystem(async (tx) => {
    let slug = slugify(input.name);
    const [taken] = await tx<{ n: number }[]>`select count(*)::int as n from organizations where slug = ${slug}`;
    if (taken.n > 0) slug = `${slug.slice(0, 33)}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
    const orgId = await createOrganization(tx, { slug, name: input.name, description: input.description, ownerUserId: user.id });
    await tx`insert into audit_logs (org_id, actor_user_id, action, target_type, target_id) values (${orgId}, ${user.id}, 'org.created', 'organization', ${orgId})`;
    return slug;
  });
  return { slug };
});
