import pg from "pg";
import { SCHEMA_SQL } from "../src/lib/server/db";
const url = process.env.DATABASE_URL;
if (!url) {
  console.log("DATABASE_URL not set — the JSON file store needs no migration.");
  process.exit(0);
}
const c = new pg.Client({ connectionString: url });
await c.connect();
await c.query(SCHEMA_SQL);
await c.end();
console.log("Schema up to date.");
