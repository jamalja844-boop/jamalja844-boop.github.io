import { z } from "zod";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { withTenant } from "@/lib/db";
import { encryptSecret, secretHint } from "@/lib/security/crypto";
import { audit } from "@/lib/security/audit";
import { getProvider, syncProviderModels } from "@/lib/ai/service";
import { ProviderError } from "@/lib/ai/types";

const schema = z.object({
  provider: z.enum(["anthropic", "openai"]),
  apiKey: z.string().trim().min(10, "API-sleutel is te kort").max(500),
  baseUrl: z.string().url().startsWith("https://", "Alleen https is toegestaan").optional().or(z.literal("")),
});

/** Slaat een AI-providersleutel versleuteld op, na verificatie bij de provider. */
export const POST = orgHandler({ permission: "credentials.manage", rate: { name: "provider-key", limit: 20, windowSec: 600 } }, async ({ req, ctx, ip }) => {
  const input = await parseJson(req, schema);
  let verified = false;
  let warning: string | null = null;
  try {
    await getProvider(input.provider).listModels({ apiKey: input.apiKey, baseUrl: input.baseUrl || null });
    verified = true;
  } catch (err) {
    if (err instanceof ProviderError && err.code === "auth") throw new ApiError(400, err.message);
    warning = `Sleutel opgeslagen maar nog niet geverifieerd: ${err instanceof Error ? err.message : String(err)}`;
  }
  await withTenant(ctx.tenant, async (tx) => {
    await tx`
      insert into credentials (org_id, kind, provider, label, encrypted_value, value_hint, config, status, last_error, last_verified_at, created_by)
      values (app_org_id(), 'llm', ${input.provider}, 'standaard', ${encryptSecret(input.apiKey, `${ctx.org.id}:llm:${input.provider}`)},
              ${secretHint(input.apiKey)}, ${tx.json({ base_url: input.baseUrl || null })}, ${verified ? "active" : "invalid"}, ${warning},
              ${verified ? new Date() : null}, app_user_id())
      on conflict (org_id, provider, label) do update set
        encrypted_value = excluded.encrypted_value, value_hint = excluded.value_hint, config = excluded.config,
        status = excluded.status, last_error = excluded.last_error, last_verified_at = excluded.last_verified_at`;
    await audit(tx, { action: "credential.saved", targetType: "provider", targetId: input.provider, ip, metadata: { verified } });
  });
  let synced = 0;
  if (verified) synced = await syncProviderModels(ctx.tenant, input.provider);
  return { verified, warning, synced };
});

export const DELETE = orgHandler({ permission: "credentials.manage" }, async ({ req, ctx, ip }) => {
  const provider = z.enum(["anthropic", "openai"]).parse(req.nextUrl.searchParams.get("provider"));
  await withTenant(ctx.tenant, async (tx) => {
    await tx`delete from credentials where kind = 'llm' and provider = ${provider}`;
    await audit(tx, { action: "credential.deleted", targetType: "provider", targetId: provider, ip });
  });
  return { ok: true };
});
