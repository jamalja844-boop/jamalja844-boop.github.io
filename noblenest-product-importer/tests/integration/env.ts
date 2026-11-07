import { randomBytes } from "node:crypto";

// Integratietests draaien ALTIJD tegen een aparte testdatabase.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://noblenest:noblenest_dev@localhost:5432/noblenest_test?schema=public";
process.env.NOBLENEST_ENCRYPTION_KEY ??= randomBytes(32).toString("base64");
