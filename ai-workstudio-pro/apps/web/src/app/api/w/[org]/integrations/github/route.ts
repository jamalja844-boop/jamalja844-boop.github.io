import { orgHandler } from "@/lib/api/handler";
import { disconnectGithub, githubStatus } from "@/lib/github/service";

export const GET = orgHandler({ permission: "code.use" }, async ({ ctx }) => githubStatus(ctx.tenant));

/** Ontkoppelen: token verwijderen en de toestemming bij GitHub intrekken. */
export const DELETE = orgHandler({ permission: "code.use" }, async ({ ctx }) => {
  await disconnectGithub(ctx.tenant);
  return { ok: true };
});
