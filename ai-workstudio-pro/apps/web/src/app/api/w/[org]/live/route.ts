import { orgHandler } from "@/lib/api/handler";
import { liveActivity } from "@/lib/dashboard";

export const GET = orgHandler({ permission: "dashboard.view" }, async ({ ctx }) => liveActivity(ctx.tenant));
