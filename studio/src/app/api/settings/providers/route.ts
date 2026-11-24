import { requireUser } from "@/lib/server/auth";
import { handler } from "@/lib/server/http";
import { listSecrets } from "@/lib/server/secrets";
import { PROVIDERS } from "@/lib/providers/registry";

export const GET = handler(async () => {
  const u = await requireUser();
  const saved = await listSecrets(u.id);
  return PROVIDERS.map((p) => {
    const s = saved.find((x) => x.provider === p.id);
    return { id: p.id, configured: !!s, enabled: s?.enabled ?? false, masked: s?.masked ?? "", settings: { ...Object.fromEntries(p.settings.map((f) => [f.key, f.default ?? ""])), ...(s?.settings ?? {}) }, updatedAt: s?.updatedAt };
  });
});
