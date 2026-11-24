import { migrate } from "../scripts/migrate";

/** Bouwt de testdatabase eenmalig opnieuw op vóór de integratietests. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://studio:studio@localhost:5432/ai_studio_test";
  await migrate(url, { reset: true, quiet: true });
}
