/**
 * Versleuteling van geheimen (API-sleutels) met AES-256-GCM.
 *
 * - De sleutel komt uit NOBLENEST_ENCRYPTION_KEY (32 bytes, base64) en staat nooit in de database of Git.
 * - Elke waarde krijgt een eigen willekeurige IV.
 * - "Additional authenticated data" (AAD) koppelt de versleutelde waarde aan winkel + instelling,
 *   zodat een versleutelde waarde niet naar een andere winkel of instelling kan worden gekopieerd.
 * - Formaat: nn1:<iv>:<tag>:<ciphertext> (base64url)
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "nn1";

export class EncryptionConfigError extends Error {}
export class DecryptionError extends Error {}

function loadKey(raw: string | undefined = process.env.NOBLENEST_ENCRYPTION_KEY): Buffer {
  if (!raw) {
    throw new EncryptionConfigError(
      "NOBLENEST_ENCRYPTION_KEY is niet ingesteld. Geheimen kunnen niet veilig worden opgeslagen.",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new EncryptionConfigError("NOBLENEST_ENCRYPTION_KEY moet 32 bytes (base64) zijn.");
  }
  return key;
}

export function isEncryptionConfigured(raw: string | undefined = process.env.NOBLENEST_ENCRYPTION_KEY): boolean {
  try {
    loadKey(raw);
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext: string, aad: string, rawKey?: string): string {
  const key = loadKey(rawKey ?? process.env.NOBLENEST_ENCRYPTION_KEY);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(":");
}

export function decryptSecret(token: string, aad: string, rawKey?: string): string {
  const key = loadKey(rawKey ?? process.env.NOBLENEST_ENCRYPTION_KEY);
  const parts = token.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) throw new DecryptionError("Onbekend formaat voor versleutelde waarde.");
  try {
    const [, iv, tag, ct] = parts as [string, string, string, string];
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new DecryptionError("Versleutelde waarde kon niet worden ontsleuteld (verkeerde sleutel of gewijzigde gegevens).");
  }
}

/** Korte, niet-gevoelige aanduiding om te tonen dat een sleutel is opgeslagen, bv. "…a1b2". */
export function secretHint(secret: string): string {
  const trimmed = secret.trim();
  return trimmed.length >= 8 ? `…${trimmed.slice(-4)}` : "…";
}
