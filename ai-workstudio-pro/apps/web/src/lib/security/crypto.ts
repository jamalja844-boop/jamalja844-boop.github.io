import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

const VERSION = "v1";

function key(): Buffer {
  const raw = Buffer.from(env().APP_ENCRYPTION_KEY, "base64");
  if (raw.length !== 32) throw new Error("APP_ENCRYPTION_KEY moet exact 32 bytes (base64) zijn");
  return raw;
}

/** AES-256-GCM met willekeurige IV; formaat v1:iv:tag:ciphertext (base64url). AAD bindt aan context. */
export function encryptSecret(plain: string, aad = ""): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  if (aad) cipher.setAAD(Buffer.from(aad));
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), enc.toString("base64url")].join(":");
}

export function decryptSecret(payload: string, aad = ""): string {
  const [version, iv, tag, data] = payload.split(":");
  if (version !== VERSION || !iv || !tag || data === undefined) throw new Error("Onbekend versleutelingsformaat");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  if (aad) decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/** Toon alleen begin en laatste 4 tekens van een geheim. */
export function secretHint(secret: string): string {
  const s = secret.trim();
  if (s.length <= 10) return "••••";
  return `${s.slice(0, 3)}…${s.slice(-4)}`;
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
