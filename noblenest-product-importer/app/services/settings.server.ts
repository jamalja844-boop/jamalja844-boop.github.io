/**
 * Instellingen per winkel. Niet-geheime instellingen staan als JSON; geheimen (API-sleutels)
 * uitsluitend versleuteld (AES-256-GCM) met een korte hint ("…abcd") voor weergave.
 */
import { z } from "zod";
import db from "../db.server";
import { decryptSecret, encryptSecret, secretHint } from "../lib/security/crypto.server";

export const importPreferencesSchema = z.object({
  defaultVendor: z.string().trim().max(255).nullable().default(null),
  extraTags: z.array(z.string().trim().min(1).max(255)).max(50).default([]),
  /** Altijd true: Noblenest importeert uitsluitend als concept. Niet instelbaar. */
  importAsDraft: z.literal(true).default(true),
});
export type ImportPreferences = z.infer<typeof importPreferencesSchema>;

export const aiSettingsSchema = z.object({
  provider: z.enum(["ANTHROPIC", "OPENAI"]).nullable().default(null),
  anthropicModel: z.string().trim().max(100).default("claude-sonnet-5-5"),
  openaiModel: z.string().trim().max(100).default(""),
  language: z.literal("nl").default("nl"),
});
export type AiSettings = z.infer<typeof aiSettingsSchema>;

export const exchangeRateSettingsSchema = z.object({
  /** Handmatige koersen (1 EUR = x valuta); hebben voorrang op ECB */
  manualRates: z.record(z.string().regex(/^[A-Z]{3}$/), z.number().positive()).default({}),
});
export type ExchangeRateSettings = z.infer<typeof exchangeRateSettingsSchema>;

const SCHEMAS = {
  "import.preferences": importPreferencesSchema,
  "ai.settings": aiSettingsSchema,
  "pricing.exchangeRates": exchangeRateSettingsSchema,
} as const;

type SettingKey = keyof typeof SCHEMAS;
type SettingValue<K extends SettingKey> = z.infer<(typeof SCHEMAS)[K]>;

export const SECRET_KEYS = ["ai.anthropic.apiKey", "ai.openai.apiKey"] as const;
export type SecretKey = (typeof SECRET_KEYS)[number];

export async function getSetting<K extends SettingKey>(shopId: string, key: K): Promise<SettingValue<K>> {
  const row = await db.appSetting.findUnique({ where: { shopId_key: { shopId, key } } });
  const parsed = SCHEMAS[key].safeParse(row?.value ?? {});
  return (parsed.success ? parsed.data : SCHEMAS[key].parse({})) as SettingValue<K>;
}

export async function setSetting<K extends SettingKey>(shopId: string, key: K, value: unknown): Promise<SettingValue<K>> {
  const parsed = SCHEMAS[key].parse(value) as SettingValue<K>;
  await db.appSetting.upsert({
    where: { shopId_key: { shopId, key } },
    create: { shopId, key, value: parsed as object },
    update: { value: parsed as object },
  });
  return parsed;
}

const aadFor = (shopId: string, key: SecretKey) => `${shopId}:${key}`;

export async function setSecret(shopId: string, key: SecretKey, secret: string): Promise<void> {
  const trimmed = secret.trim();
  if (trimmed.length < 8 || trimmed.length > 500) throw new Error("De API-sleutel heeft een ongeldige lengte.");
  const valueEncrypted = encryptSecret(trimmed, aadFor(shopId, key));
  const value = { hint: secretHint(trimmed), updatedAt: new Date().toISOString() };
  await db.appSetting.upsert({
    where: { shopId_key: { shopId, key } },
    create: { shopId, key, value, valueEncrypted },
    update: { value, valueEncrypted },
  });
}

export async function deleteSecret(shopId: string, key: SecretKey): Promise<void> {
  await db.appSetting.deleteMany({ where: { shopId, key } });
}

/** Alleen server-side gebruiken; nooit naar de browser sturen. */
export async function getSecret(shopId: string, key: SecretKey): Promise<string | null> {
  const row = await db.appSetting.findUnique({ where: { shopId_key: { shopId, key } } });
  if (!row?.valueEncrypted) return null;
  return decryptSecret(row.valueEncrypted, aadFor(shopId, key));
}

/** Veilig voor weergave: alleen of er een sleutel is en de hint. */
export async function getSecretStatus(shopId: string): Promise<Record<SecretKey, { configured: boolean; hint: string | null; updatedAt: string | null }>> {
  const rows = await db.appSetting.findMany({ where: { shopId, key: { in: [...SECRET_KEYS] } } });
  const status = {} as Record<SecretKey, { configured: boolean; hint: string | null; updatedAt: string | null }>;
  for (const key of SECRET_KEYS) {
    const row = rows.find((r) => r.key === key);
    const meta = (row?.value ?? {}) as { hint?: string; updatedAt?: string };
    status[key] = { configured: !!row?.valueEncrypted, hint: meta.hint ?? null, updatedAt: meta.updatedAt ?? null };
  }
  return status;
}
