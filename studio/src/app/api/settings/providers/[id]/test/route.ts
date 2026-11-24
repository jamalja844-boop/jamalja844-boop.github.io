import { HttpError, requireUser, rateLimit } from "@/lib/server/auth";
import { handler } from "@/lib/server/http";
import { getCredentials } from "@/lib/server/secrets";
import { testProvider } from "@/lib/providers/llm";

export const POST = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const u = await requireUser();
  rateLimit(`test:${u.id}`, 30, 60_000);
  const { id } = await params;
  const c = await getCredentials(u.id, id);
  if (!c) throw new HttpError(400, "Save credentials first");
  return testProvider(id, c.values, c.settings);
});
