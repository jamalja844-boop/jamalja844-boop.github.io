import crypto from "node:crypto";
import { config } from "./config";

/** AES-256-GCM encryption for secrets at rest (provider API keys, store tokens). */
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", config.encryptionKey, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decrypt(payload: string): string {
  const [v, ivB, tagB, encB] = payload.split(":");
  if (v !== "v1") throw new Error("Unknown ciphertext version");
  const decipher = crypto.createDecipheriv("aes-256-gcm", config.encryptionKey, Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encB, "base64")), decipher.final()]).toString("utf8");
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt:${salt.toString("base64")}:${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [alg, saltB, hashB] = stored.split(":");
  if (alg !== "scrypt") return false;
  const expected = Buffer.from(hashB, "base64");
  const actual = crypto.scryptSync(password, Buffer.from(saltB, "base64"), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, actual);
}

/** HMAC signature for time-limited file URLs (used by the render worker). */
export function signPath(id: string, expiresAt: number): string {
  return crypto.createHmac("sha256", config.sessionSecret).update(`${id}.${expiresAt}`).digest("base64url");
}

export function verifySignedPath(id: string, exp: string | null, sig: string | null): boolean {
  if (!exp || !sig) return false;
  const e = Number(exp);
  if (!Number.isFinite(e) || e < Date.now()) return false;
  const expected = Buffer.from(signPath(id, e));
  const given = Buffer.from(sig);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

export const mask = (key: string) => (key.length <= 8 ? "••••" : `${key.slice(0, 3)}••••${key.slice(-4)}`);
