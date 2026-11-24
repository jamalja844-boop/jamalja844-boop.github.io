import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { decideApproval } from "@/lib/approvals/service";

const schema = z.object({ decision: z.enum(["approve", "reject"]), note: z.string().max(1000).optional() });

export const POST = orgHandler<{ org: string; id: string }>(
  { permission: "approvals.decide", rate: { name: "approvals", limit: 60, windowSec: 60 } },
  async ({ req, ctx, params }) => {
    const approvalId = z.string().uuid().parse(params.id);
    const input = await parseJson(req, schema);
    const result = await decideApproval(ctx.tenant, ctx.role, approvalId, input.decision === "approve", input.note);
    return { status: result.status, execution: result.execution ? { status: result.execution.status, error: result.execution.error ?? null } : null };
  },
);
