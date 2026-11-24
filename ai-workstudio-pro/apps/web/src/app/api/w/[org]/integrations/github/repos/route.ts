import { orgHandler } from "@/lib/api/handler";
import { listRepos } from "@/lib/github/service";

export const GET = orgHandler({ permission: "code.use", rate: { name: "gh-repos", limit: 30, windowSec: 60 } }, async ({ ctx }) => ({ repos: await listRepos(ctx.tenant) }));
