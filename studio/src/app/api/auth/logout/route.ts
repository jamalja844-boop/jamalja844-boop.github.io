import { destroySession } from "@/lib/server/auth";
import { handler } from "@/lib/server/http";
export const POST = handler(async () => {
  await destroySession();
  return { ok: true };
});
