import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** Minimale .env-lader voor CLI-scripts (Next.js laadt .env zelf). Overschrijft geen bestaande variabelen. */
export function loadEnvFile(file = ".env") {
  const p = path.resolve(process.cwd(), file);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trimStart().startsWith("#")) continue;
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
