import { z } from "zod";
import { requireUser, rateLimit } from "@/lib/server/auth";
import { handler } from "@/lib/server/http";
import { createVideoJob } from "@/lib/agents/videoJob";
import { db } from "@/lib/server/db";
import type { JobData } from "@/lib/models";

export const POST = handler(async (req: Request) => {
  const u = await requireUser();
  rateLimit(`aivideo:${u.id}`, 20, 3600_000);
  const b = z.object({ provider: z.enum(["runway", "gemini", "kling"]), prompt: z.string().min(3).max(2000), imageAssetId: z.string().optional(), aspect: z.enum(["16:9", "9:16", "1:1"]), seconds: z.number().int().min(4).max(10) }).parse(await req.json());
  const job = await createVideoJob(u.id, b);
  return { jobId: job.id };
});

export const GET = handler(async () => {
  const u = await requireUser();
  const rows = await db.list<JobData>("jobs", u.id, { type: "aivideo" });
  return rows.slice(0, 30).map((r) => ({ id: r.id, createdAt: r.created_at, ...r.data }));
});
