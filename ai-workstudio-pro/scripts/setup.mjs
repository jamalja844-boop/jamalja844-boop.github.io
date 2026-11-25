#!/usr/bin/env node
/**
 * Eenmalige installatie van AI WorkStudio Pro (Windows, macOS, Linux):
 *   npm install
 *   npm run setup
 *   npm run dev
 *
 * Wat dit script doet:
 *  1. controleert Node.js en (optioneel) Docker;
 *  2. kiest de database:
 *     - met Docker: PostgreSQL 16 + pgvector in een container (poort 5433, eigen volume);
 *     - zonder Docker: een gratis online database (Supabase of Neon) – je plakt de verbindingsregel;
 *     - of zelf opgeven: npm run setup -- --database-url "postgres://…";
 *  3. maakt apps/web/.env aan met een willekeurige encryptiesleutel (een bestaand .env-bestand
 *     wordt nooit overschreven);
 *  4. haalt het sandbox-image voor AI Code op (alleen met Docker);
 *  5. voert de databasemigraties uit.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDir = path.join(root, "apps", "web");
const envFile = path.join(webDir, ".env");
const CONTAINER = "workstudio-db";
const VOLUME = "workstudio-db-data";
const DB_PORT = 5433;
const DB_IMAGE = "pgvector/pgvector:pg16";
const SANDBOX_IMAGE = "node:22-alpine";

const ok = (m) => console.log(`\x1b[32m✓\x1b[0m ${m}`);
const info = (m) => console.log(`\x1b[36m→\x1b[0m ${m}`);
const warn = (m) => console.log(`\x1b[33m!\x1b[0m ${m}`);
const fail = (m) => {
  console.error(`\n\x1b[31m✗ ${m}\x1b[0m\n`);
  process.exit(1);
};

function run(cmd, args, opts = {}) {
  // docker.exe wordt zonder shell gestart (geen cmd.exe-interpretatie van tekens zoals ^); npm gebruikt hieronder wel een shell.
  const r = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  return { code: r.status ?? 1, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() };
}

function argValue(name) {
  const i = process.argv.findIndex((a) => a === name || a.startsWith(`${name}=`));
  if (i < 0) return null;
  const a = process.argv[i];
  return a.includes("=") ? a.slice(a.indexOf("=") + 1) : process.argv[i + 1] ?? null;
}

/** Valideert een PostgreSQL-verbindingsregel; voegt sslmode=require toe voor online databases. */
function normalizeDbUrl(raw) {
  let u;
  try {
    u = new URL(raw.trim().replace(/^["']|["']$/g, ""));
  } catch {
    return null;
  }
  if (!["postgres:", "postgresql:"].includes(u.protocol) || !u.hostname || !u.pathname.slice(1)) return null;
  const local = ["localhost", "127.0.0.1", "::1"].includes(u.hostname);
  if (!local && !u.searchParams.has("sslmode")) u.searchParams.set("sslmode", "require");
  return u.toString();
}

// 1. Node.js en Docker
const major = Number(process.versions.node.split(".")[0]);
if (major < 22) fail(`Node.js ${process.versions.node} is te oud. Installeer Node.js 22 of nieuwer via https://nodejs.org`);
ok(`Node.js ${process.versions.node}`);

const dockerInstalled = run("docker", ["--version"]).code === 0;
const dockerRunning = dockerInstalled && run("docker", ["info", "--format", "{{.ServerVersion}}"]).code === 0;
if (dockerRunning) ok(`Docker ${run("docker", ["info", "--format", "{{.ServerVersion}}"]).out}`);
else if (dockerInstalled) warn("Docker is geïnstalleerd maar draait niet (start Docker Desktop als je de database in Docker wilt).");
else warn("Docker is niet gevonden. Dat is niet erg: je kunt een gratis online database gebruiken. Alleen AI Code-commando's hebben Docker nodig.");

/** Haalt een image op; bij een Docker Hub-limiet via de Google-mirror. */
function ensureImage(image) {
  if (run("docker", ["image", "inspect", image]).code === 0) return true;
  info(`Image ${image} downloaden…`);
  if (run("docker", ["pull", image], { stdio: "inherit" }).code === 0) return true;
  const mirror = `mirror.gcr.io/${image.includes("/") ? image : `library/${image}`}`;
  info(`Opnieuw via ${mirror}…`);
  return run("docker", ["pull", mirror], { stdio: "inherit" }).code === 0 && run("docker", ["tag", mirror, image]).code === 0;
}

const isLocalContainerUrl = (u) => ["localhost", "127.0.0.1"].includes(u.hostname) && Number(u.port) === DB_PORT;

// 2. Database kiezen en .env aanmaken
let created = false;
if (!existsSync(envFile)) {
  let dbUrl = null;
  const given = argValue("--database-url");
  if (given) {
    dbUrl = normalizeDbUrl(given);
    if (!dbUrl) fail("De opgegeven --database-url is geen geldige PostgreSQL-verbindingsregel (postgres://gebruiker:wachtwoord@host:poort/database).");
  } else if (dockerRunning) {
    dbUrl = `postgres://studio:${randomBytes(18).toString("base64url")}@localhost:${DB_PORT}/ai_studio`;
  } else {
    console.log(`
\x1b[1mGeen Docker? Gebruik een gratis online database (met pgvector):\x1b[0m
  • Supabase: https://supabase.com → New project → knop "Connect" → kopieer de "Session pooler"-regel
    (vervang [YOUR-PASSWORD] door het databasewachtwoord dat je bij het aanmaken koos)
  • Neon:     https://neon.tech → New project → "Connection string" kopiëren
`);
    if (!process.stdin.isTTY) fail('Start dit script opnieuw met: npm run setup -- --database-url "postgres://…"');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    for (let attempt = 0; attempt < 3 && !dbUrl; attempt++) {
      const answer = (await rl.question("Plak hier de verbindingsregel (of druk Enter om te stoppen): ")).trim();
      if (!answer) break;
      dbUrl = normalizeDbUrl(answer);
      if (!dbUrl) warn("Dat lijkt geen geldige verbindingsregel. Hij begint met postgres:// of postgresql://");
    }
    rl.close();
    if (!dbUrl) fail("Geen database gekozen. Start Docker Desktop, of maak een online database aan en voer `npm run setup` opnieuw uit.");
  }
  const u = new URL(dbUrl);
  const key = randomBytes(32).toString("base64");
  const example = readFileSync(path.join(webDir, ".env.example"), "utf8");
  const set = (text, name, value) => (new RegExp(`^${name}=.*$`, "m").test(text) ? text.replace(new RegExp(`^${name}=.*$`, "m"), () => `${name}=${value}`) : `${text}\n${name}=${value}\n`);
  let env = example;
  env = set(env, "DATABASE_URL", dbUrl);
  // Transaction pooler (poort 6543) ondersteunt geen prepared statements.
  env = set(env, "DATABASE_PREPARE", Number(u.port) === 6543 ? "false" : "true");
  env = set(env, "APP_ENCRYPTION_KEY", key);
  env = set(env, "APP_URL", "http://localhost:3000");
  env = set(env, "ENABLE_DEMO_PROVIDER", "true");
  env = set(env, "RUN_WORKER_IN_WEB", "false");
  writeFileSync(envFile, env, { mode: 0o600 });
  created = true;
  ok("apps/web/.env aangemaakt met een database-URL en een nieuwe encryptiesleutel");
} else {
  ok("apps/web/.env bestaat al (niet aangepast)");
}

const envText = readFileSync(envFile, "utf8");
if (!/^[A-Za-z0-9+/=]{40,}$/.test(envText.match(/^APP_ENCRYPTION_KEY=(.*)$/m)?.[1]?.trim() ?? "")) {
  fail("APP_ENCRYPTION_KEY in apps/web/.env ontbreekt of is ongeldig. Verwijder apps/web/.env en voer dit script opnieuw uit, of vul de sleutel zelf in.");
}
let url;
try {
  url = new URL(envText.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim() ?? "");
} catch {
  fail("DATABASE_URL in apps/web/.env is ongeldig.");
}

// 3. Database in Docker (alleen als .env naar de meegeleverde database op poort 5433 wijst)
if (isLocalContainerUrl(url)) {
  if (!dockerRunning) {
    fail(`apps/web/.env gebruikt de Docker-database (poort ${DB_PORT}), maar Docker draait niet. Start Docker Desktop en voer dit script opnieuw uit.\nWil je liever een online database? Verwijder dan apps/web/.env en voer \`npm run setup\` opnieuw uit.`);
  }
  const exists = run("docker", ["ps", "-a", "--filter", `name=^${CONTAINER}$`, "--format", "{{.Names}}"]).out === CONTAINER;
  if (!exists) {
    if (!ensureImage(DB_IMAGE)) fail(`Het database-image ${DB_IMAGE} kon niet worden gedownload. Controleer je internetverbinding.`);
    info("Databasecontainer starten…");
    const r = run("docker", [
      "run", "-d", "--name", CONTAINER, "--restart", "unless-stopped", "-p", `127.0.0.1:${DB_PORT}:5432`,
      "-e", `POSTGRES_USER=${decodeURIComponent(url.username)}`, "-e", `POSTGRES_PASSWORD=${decodeURIComponent(url.password)}`,
      "-e", `POSTGRES_DB=${url.pathname.slice(1)}`, "-v", `${VOLUME}:/var/lib/postgresql/data`, DB_IMAGE,
    ]);
    if (r.code !== 0) fail(`Databasecontainer starten mislukt: ${r.err}`);
  } else {
    if (created) {
      fail(`Er bestaat al een container "${CONTAINER}" met een ander wachtwoord. Verwijder hem eerst (let op: dit wist die database):\n  docker rm -f ${CONTAINER}\n  docker volume rm ${VOLUME}\nen voer daarna dit script opnieuw uit.`);
    }
    run("docker", ["start", CONTAINER]);
  }
  info("Wachten tot de database klaar is…");
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    ready = run("docker", ["exec", CONTAINER, "pg_isready", "-U", decodeURIComponent(url.username), "-d", url.pathname.slice(1)]).code === 0;
    if (!ready) await new Promise((r) => setTimeout(r, 1000));
  }
  if (!ready) fail(`De database start niet. Bekijk de logboeken met: docker logs ${CONTAINER}`);
  ok(`PostgreSQL + pgvector draait in Docker (container "${CONTAINER}", poort ${DB_PORT})`);
} else {
  info(`Database: ${url.hostname}${url.port ? `:${url.port}` : ""} (beheerd buiten Docker; pgvector is vereist)`);
}

// 4. Sandbox-image voor AI Code
if (dockerRunning) {
  if (ensureImage(SANDBOX_IMAGE)) ok(`Sandbox-image ${SANDBOX_IMAGE} aanwezig (voor AI Code)`);
  else warn(`Sandbox-image ${SANDBOX_IMAGE} niet beschikbaar; AI Code-commando's werken pas na: docker pull ${SANDBOX_IMAGE}`);
} else {
  warn("Zonder Docker werken AI Chat, Schrijfstudio en Cowork gewoon. Alleen commando's en AI-taken in AI Code vragen Docker Desktop.");
}

// 5. Migraties
info("Database inrichten (migraties)…");
const mig = spawnSync("npm", ["run", "db:migrate"], { cwd: root, stdio: "inherit", shell: true });
if (mig.status !== 0) {
  fail(`Migraties mislukt (zie de melding hierboven).${isLocalContainerUrl(url) ? "" : "\nControleer de verbindingsregel in apps/web/.env (wachtwoord ingevuld? juiste host?). Bij Supabase: gebruik de \"Session pooler\"-regel."}`);
}

console.log(`
\x1b[32mKlaar!\x1b[0m Start AI WorkStudio Pro met:

  npm run dev

en open http://localhost:3000 in je browser. Bij de eerste keer maak je daar het beheerdersaccount aan.
Echte AI-antwoorden: Instellingen → AI-providers → Anthropic- of OpenAI-sleutel.
`);
