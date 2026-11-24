import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL ontbreekt"),
  DATABASE_PREPARE: z.enum(["true", "false"]).default("true"),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_ENCRYPTION_KEY: z.string().min(40, "APP_ENCRYPTION_KEY moet 32 bytes base64 zijn"),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 90).default(24 * 7),
  ALLOW_SIGNUP: z.enum(["true", "false"]).default("false"),
  ENABLE_DEMO_PROVIDER: z.enum(["true", "false"]).default("false"),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_REFUSAL_FALLBACK: z.enum(["true", "false"]).default("true"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  MAX_UPLOAD_MB: z.coerce.number().min(1).max(100).default(20),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
  NODE_ENV: z.string().default("development"),
});

export type Env = z.infer<typeof schema>;
let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Ongeldige configuratie (.env): ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Alleen voor tests: forceer herladen van de configuratie. */
export function resetEnvCache() {
  cached = null;
}

export const isProduction = () => env().NODE_ENV === "production";
export const demoProviderEnabled = () => env().ENABLE_DEMO_PROVIDER === "true";
