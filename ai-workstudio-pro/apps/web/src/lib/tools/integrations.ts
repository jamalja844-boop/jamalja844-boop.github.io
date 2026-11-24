import { withTenant, json, type TenantContext } from "@/lib/db";
import { env } from "@/lib/env";
import { ConfigurationError } from "@/lib/api/errors";
import { decryptSecret, encryptSecret } from "@/lib/security/crypto";
import { INTEGRATIONS, type IntegrationId } from "@/lib/tools/definitions";

export interface IntegrationSecret {
  id: string;
  label: string;
  secret: Record<string, string>;
  config: Record<string, unknown>;
}

const aad = (orgId: string, provider: string) => `${orgId}:integration:${provider}`;

/** Haalt de (ontsleutelde) integratiegegevens op. Alleen server-side gebruiken. */
export async function getIntegration(ctx: TenantContext, provider: IntegrationId, credentialId?: string | null): Promise<IntegrationSecret> {
  const [row] = await withTenant(ctx, (tx) => tx<{ id: string; label: string; encrypted_value: string; config: Record<string, unknown> }[]>`
    select id, label, encrypted_value, config from credentials
     where kind = 'integration' and provider = ${provider} and (${credentialId ?? null}::uuid is null or id = ${credentialId ?? null}::uuid)
     order by created_at limit 1`);
  if (!row) {
    throw new ConfigurationError(
      `De integratie "${INTEGRATIONS[provider].name}" is nog niet gekoppeld. Stel de verbinding in onder Tools & Integraties.`,
      { provider, where: "tools/integrations" },
    );
  }
  return { id: row.id, label: row.label, secret: JSON.parse(decryptSecret(row.encrypted_value, aad(ctx.orgId, provider))), config: row.config ?? {} };
}

export async function saveIntegration(
  ctx: TenantContext,
  provider: IntegrationId,
  label: string,
  secret: Record<string, string>,
  config: Record<string, unknown>,
) {
  const values = Object.values(secret).filter(Boolean);
  const hint = values[0] ? `${values[0].slice(0, 3)}…${values[0].slice(-4)}` : "";
  return withTenant(ctx, async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      insert into credentials (org_id, kind, provider, label, encrypted_value, value_hint, config, created_by)
      values (app_org_id(), 'integration', ${provider}, ${label}, ${encryptSecret(JSON.stringify(secret), aad(ctx.orgId, provider))},
              ${hint}, ${json(tx, config)}, app_user_id())
      on conflict (org_id, provider, label) do update set
        encrypted_value = excluded.encrypted_value, value_hint = excluded.value_hint, config = excluded.config,
        status = 'active', last_error = null
      returning id`;
    // Tools van deze integratie inschakelen nu de verbinding bestaat.
    return row.id;
  });
}

/** Geldig Google access token (vernieuwt automatisch met het refresh token). */
export async function googleAccessToken(ctx: TenantContext): Promise<string> {
  const integ = await getIntegration(ctx, "google");
  const expiresAt = Number(integ.secret.expires_at ?? 0);
  if (integ.secret.access_token && expiresAt > Date.now() + 60_000) return integ.secret.access_token;
  const e = env();
  if (!e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET) {
    throw new ConfigurationError("GOOGLE_CLIENT_ID en GOOGLE_CLIENT_SECRET ontbreken in de serverconfiguratie.", { provider: "google", where: ".env" });
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: e.GOOGLE_CLIENT_ID,
      client_secret: e.GOOGLE_CLIENT_SECRET,
      refresh_token: integ.secret.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const data = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !data.access_token) throw new Error(`Google-token vernieuwen mislukt: ${data.error_description ?? res.status}`);
  await saveIntegration(ctx, "google", integ.label, { ...integ.secret, access_token: data.access_token, expires_at: String(Date.now() + (data.expires_in ?? 3600) * 1000) }, integ.config);
  return data.access_token;
}
