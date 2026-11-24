import { z } from "zod";
import { HttpError, requireUser } from "@/lib/server/auth";
import { handler } from "@/lib/server/http";
import { deleteSecret, getCredentials, setSecret } from "@/lib/server/secrets";
import { getProvider } from "@/lib/providers/registry";

type P = { params: Promise<{ id: string }> };

export const PUT = handler(async (req: Request, { params }: P) => {
  const u = await requireUser();
  const { id } = await params;
  const def = getProvider(id);
  if (!def || def.status !== "available") throw new HttpError(400, "Provider not available");
  const b = z.object({ credentials: z.record(z.string(), z.string().max(4000)), settings: z.record(z.string(), z.string().max(500)), enabled: z.boolean().default(true) }).parse(await req.json());
  const credentials = Object.fromEntries(Object.entries(b.credentials).filter(([k]) => def.credentials.some((f) => f.key === k)));
  const settings = Object.fromEntries(Object.entries(b.settings).filter(([k]) => def.settings.some((f) => f.key === k)));
  const existing = await getCredentials(u.id, id).catch(() => null);
  if (!existing && def.credentials.some((f) => !credentials[f.key])) throw new HttpError(400, "All credential fields are required");
  await setSecret(u.id, id, credentials, settings, b.enabled);
  return { ok: true };
});

export const DELETE = handler(async (_req: Request, { params }: P) => {
  const u = await requireUser();
  await deleteSecret(u.id, (await params).id);
  return { ok: true };
});
