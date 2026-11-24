import postgres from "postgres";
import { migrate } from "../../scripts/migrate";

/** Maakt de e2e-database aan (indien nodig) en bouwt hem leeg opnieuw op. */
export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL ?? "postgres://studio:studio@localhost:5432/ai_studio_e2e";
  const dbName = new URL(url).pathname.slice(1);
  const admin = postgres(url.replace(`/${dbName}`, "/postgres"), { max: 1, onnotice: () => {} });
  const [exists] = await admin`select 1 from pg_database where datname = ${dbName}`;
  if (!exists) await admin.unsafe(`create database "${dbName.replace(/"/g, "")}"`);
  await admin.end();
  const prev = process.env.NODE_ENV;
  // De reset is alleen toegestaan buiten productie; de e2e-server zelf draait wel als productiebuild.
  (process.env as Record<string, string>).NODE_ENV = "test";
  await migrate(url, { reset: true, quiet: true });
  (process.env as Record<string, string | undefined>).NODE_ENV = prev;
}
