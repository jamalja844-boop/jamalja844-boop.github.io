/**
 * Migratierunner: past db/migrations/*.sql in volgorde toe (elk in een transactie)
 * en registreert ze met checksum in schema_migrations.
 *   npm run db:migrate            – nieuwe migraties toepassen
 *   npm run db:migrate -- --reset – database leegmaken en opnieuw opbouwen (alleen dev/test)
 */
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import postgres from "postgres";
import { loadEnvFile } from "./load-env";

loadEnvFile();

export async function migrate(databaseUrl: string, opts: { reset?: boolean; quiet?: boolean } = {}) {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  const log = (m: string) => !opts.quiet && console.log(m);
  try {
    if (opts.reset) {
      if (process.env.NODE_ENV === "production") throw new Error("--reset is niet toegestaan in productie");
      log("⚠  Database wordt leeggemaakt (schema public)…");
      await sql.unsafe("drop schema if exists public cascade; create schema public; grant all on schema public to public;");
    }
    await sql`create table if not exists schema_migrations (
      filename text primary key, checksum text not null, applied_at timestamptz not null default now())`;
    const dir = path.resolve(process.cwd(), "db/migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const applied = new Map(
      (await sql<{ filename: string; checksum: string }[]>`select filename, checksum from schema_migrations`).map((r) => [r.filename, r.checksum]),
    );
    let count = 0;
    for (const file of files) {
      const content = readFileSync(path.join(dir, file), "utf8");
      const checksum = createHash("sha256").update(content).digest("hex");
      const prev = applied.get(file);
      if (prev) {
        if (prev !== checksum) throw new Error(`Migratie ${file} is gewijzigd na toepassing. Maak een nieuwe migratie aan.`);
        continue;
      }
      log(`→ ${file}`);
      await sql.begin(async (tx) => {
        await tx.unsafe(content);
        await tx`insert into schema_migrations (filename, checksum) values (${file}, ${checksum})`;
      });
      count++;
    }
    // De runtime-rol mag de migratietabel nooit zien of wijzigen.
    await sql.unsafe("revoke all on schema_migrations from studio_app");
    log(count ? `✓ ${count} migratie(s) toegepast` : "✓ Database is up-to-date");
  } finally {
    await sql.end();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]).endsWith(path.join("scripts", "migrate.ts"));
if (isMain) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL ontbreekt. Kopieer .env.example naar .env en vul deze in.");
    process.exit(1);
  }
  migrate(url, { reset: process.argv.includes("--reset") }).catch((err) => {
    console.error("✗ Migratie mislukt:", err.message);
    process.exit(1);
  });
}
