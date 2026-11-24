import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

function scrypt(pw: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(pw, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

// scrypt (memory-hard). Parameters staan in de hash, zodat ze later verhoogd kunnen worden.
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 96 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, "base64url");
  const actual = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64url"), expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: MAXMEM,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Dummy-verificatie om timing-verschillen bij onbekende e-mailadressen te voorkomen. */
let dummyHash: Promise<string> | null = null;
export async function fakeVerify(password: string) {
  dummyHash ??= hashPassword("dummy-password-1234567");
  await verifyPassword(password, await dummyHash);
}

/** Wachtwoordbeleid: minimaal 12 tekens met letters en cijfers, geen voorspelbare woorden. */
export function passwordProblems(password: string, email?: string): string[] {
  const problems: string[] = [];
  if (password.length < 12) problems.push("minimaal 12 tekens");
  if (password.length > 200) problems.push("maximaal 200 tekens");
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) problems.push("letters én cijfers bevatten");
  const lower = password.toLowerCase();
  if (["wachtwoord", "password", "welkom", "123456", "qwerty"].some((w) => lower.includes(w))) problems.push("geen voorspelbaar woord bevatten");
  const local = email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) problems.push("niet je e-mailnaam bevatten");
  return problems;
}
