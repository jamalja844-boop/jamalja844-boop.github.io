import { execSync } from "node:child_process";

export default function setup() {
  const url =
    process.env.TEST_DATABASE_URL ?? "postgresql://noblenest:noblenest_dev@localhost:5432/noblenest_test?schema=public";
  if (!/_test\b/.test(new URL(url).pathname)) {
    throw new Error("Weigering: integratietests mogen alleen draaien op een database met '_test' in de naam.");
  }
  // Niet-destructief: past alleen ontbrekende migraties toe. De tests legen zelf hun tabellen (helpers.resetDatabase).
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}
