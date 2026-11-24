import { withSystem } from "@/lib/db";
import { ApiError } from "@/lib/api/errors";

/**
 * Rate limiting met vaste vensters in PostgreSQL (werkt over meerdere instanties).
 * Gooit ApiError 429 als de limiet is overschreden.
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<void> {
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / (windowSec * 1000)) * windowSec * 1000);
  const [row] = await withSystem((tx) => tx<{ count: number }[]>`
    insert into rate_limits (key, window_start, count) values (${key}, ${windowStart}, 1)
    on conflict (key, window_start) do update set count = rate_limits.count + 1
    returning count`);
  if (Math.random() < 0.01) {
    await withSystem((tx) => tx`delete from rate_limits where window_start < now() - interval '1 day'`);
  }
  if (row && row.count > limit) {
    const retry = Math.ceil((windowStart.getTime() + windowSec * 1000 - now) / 1000);
    throw new ApiError(429, `Te veel verzoeken. Probeer het over ${retry} seconden opnieuw.`, { retryAfter: retry });
  }
}
