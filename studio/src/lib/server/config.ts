import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
let warned = false;

function devSecret(name: string): string {
  // Deterministic per-install fallback for local development only.
  if (process.env.NODE_ENV === "production") throw new Error(`${name} must be set in production`);
  if (!warned) {
    console.warn(`[config] ${name} not set — using an insecure development default. Set it in .env.local.`);
    warned = true;
  }
  return crypto.createHash("sha256").update(`dev-${name}-${root}`).digest("hex");
}

export const config = {
  root,
  storageDir: process.env.STORAGE_DIR || path.join(root, "storage"),
  appUrl: (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, ""),
  get encryptionKey(): Buffer {
    const raw = process.env.ENCRYPTION_KEY || devSecret("ENCRYPTION_KEY");
    const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
    if (buf.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64)");
    return buf;
  },
  get sessionSecret(): string {
    const s = process.env.SESSION_SECRET || devSecret("SESSION_SECRET");
    if (s.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
    return s;
  },
  databaseUrl: process.env.DATABASE_URL || "",
  redisUrl: process.env.REDIS_URL || "",
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  supabaseBucket: process.env.SUPABASE_BUCKET || "ad-studio",
  browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE || "",
  gl: (process.env.REMOTION_GL || "angle") as "angle" | "swangle" | "egl" | "swiftshader",
};
