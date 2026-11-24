import { db } from "@/lib/server/db";
import { HttpError, requireUser } from "@/lib/server/auth";
import { handler } from "@/lib/server/http";
import type { JobData } from "@/lib/models";
import { advanceVideoJob } from "@/lib/agents/videoJob";

export const GET = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const u = await requireUser();
  const { id } = await params;
  let row = await db.getOwned<JobData>("jobs", id, u.id);
  if (!row) throw new HttpError(404, "Job not found");
  if (row.data.type === "aivideo" && row.data.status === "running") row = await advanceVideoJob(row);
  // a generate job whose process died stops sending heartbeats
  if (row.data.type === "generate" && row.data.status === "running" && Date.now() - new Date(row.data.heartbeat).getTime() > 10 * 60_000) {
    row = await db.update("jobs", row, { ...row.data, status: "failed", error: "The job stopped responding (server restarted?). Please start it again." });
  }
  return { id: row.id, ...row.data };
});
