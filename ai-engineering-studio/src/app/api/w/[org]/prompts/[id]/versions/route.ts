import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { createVersion, versionSchema } from "@/lib/prompts/service";

export const POST = orgHandler<{ org: string; id: string }>({ permission: "prompts.manage" }, async ({ req, ctx, params }) => {
  const id = z.string().uuid().parse(params.id);
  const input = await parseJson(req, versionSchema, 300_000);
  const version = await createVersion(ctx.tenant, id, input);
  return { version };
});
