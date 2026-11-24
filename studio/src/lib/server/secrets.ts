// Per-user provider credentials, encrypted with AES-256-GCM before they hit storage.
import { db } from "./db";
import { decrypt, encrypt, mask } from "./crypto";

export interface SecretData {
  provider: string;
  /** encrypted JSON of { apiKey, ...extra } */
  cipher: string;
  masked: string;
  settings: Record<string, string>;
  enabled: boolean;
}

export async function setSecret(owner: string, provider: string, values: Record<string, string>, settings: Record<string, string>, enabled = true) {
  const existing = (await db.list<SecretData>("secrets", owner, { provider }))[0];
  const prev = existing ? (JSON.parse(decrypt(existing.data.cipher)) as Record<string, string>) : {};
  const merged = { ...prev };
  for (const [k, v] of Object.entries(values)) if (v) merged[k] = v; // empty input keeps the stored value
  const primary = merged.apiKey || merged.accessKey || merged.token || Object.values(merged)[0] || "";
  const data: SecretData = { provider, cipher: encrypt(JSON.stringify(merged)), masked: primary ? mask(primary) : "", settings, enabled };
  if (existing) return db.update("secrets", existing, data);
  return db.insert("secrets", owner, data);
}

export async function getCredentials(owner: string, provider: string): Promise<{ values: Record<string, string>; settings: Record<string, string> } | null> {
  const row = (await db.list<SecretData>("secrets", owner, { provider }))[0];
  if (!row || !row.data.enabled) return null;
  return { values: JSON.parse(decrypt(row.data.cipher)), settings: row.data.settings };
}

export async function listSecrets(owner: string) {
  const rows = await db.list<SecretData>("secrets", owner);
  return rows.map((r) => ({ provider: r.data.provider, masked: r.data.masked, settings: r.data.settings, enabled: r.data.enabled, updatedAt: r.updated_at }));
}

export async function deleteSecret(owner: string, provider: string) {
  const row = (await db.list<SecretData>("secrets", owner, { provider }))[0];
  if (row) await db.del("secrets", row.id);
}
