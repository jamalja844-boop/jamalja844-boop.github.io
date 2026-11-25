import { db } from "@/lib/server/db";
import { HttpError, requireUser } from "@/lib/server/auth";
import { handler } from "@/lib/server/http";
import type { TokenData } from "@/lib/server/tokens";

export const DELETE = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const u = await requireUser();
  const row = await db.getOwned<TokenData>("tokens", (await params).id, u.id);
  if (!row) throw new HttpError(404, "Not found");
  await db.del("tokens", row.id);
  return { ok: true };
});
