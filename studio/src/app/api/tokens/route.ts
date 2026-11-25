import { z } from "zod";
import { db } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import { handler } from "@/lib/server/http";
import { createToken, type TokenData } from "@/lib/server/tokens";

export const GET = handler(async () => {
  const u = await requireUser();
  return (await db.list<TokenData>("tokens", u.id)).map((r) => ({ id: r.id, name: r.data.name, prefix: r.data.prefix, lastUsedAt: r.data.lastUsedAt, createdAt: r.created_at }));
});

export const POST = handler(async (req: Request) => {
  const u = await requireUser();
  const { name } = z.object({ name: z.string().min(1).max(80) }).parse(await req.json());
  return createToken(u.id, name);
});
