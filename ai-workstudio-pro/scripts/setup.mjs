#!/usr/bin/env node
/**
 * Eenmalige installatie van AI WorkStudio Pro (Windows, macOS, Linux):
 *   npm install
 *   npm run setup
 *   npm run dev
 *
 * Wat dit script doet:
 *  1. controleert Node.js en Docker (Docker Desktop moet draaien);
 *  2. start PostgreSQL 16 met pgvector in een Docker-container (poort 5433, eigen volume);
 *  3. maakt apps/web/.env aan met een database-URL en een willekeurige encryptiesleutel
 *     (een bestaand .env-bestand wordt nooit overschreven);
 *  4. haalt het sandbox-image voor AI Code op (node:22-alpine);
 *  5. voert de databasemigraties uit.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
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
const fail = (m) => {
  console.error(`\n\x1b[31m✗ ${m}\x1b[0m\n`);
  process.exit(1);
};

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", shell: process.platform === "win32", ...opts });
  return { code: r.status ?? 1, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() };
}

// 1. Node.js en Docker
const major = Number(process.versions.node.split(".")[0]);
if (major < 22) fail(`Node.js ${process.versions.node} is te oud. Installeer Node.js 22 of nieuwer via https://nodejs.org`);
ok(`Node.js ${process.versions.node}`);

if (run("docker", ["--version"]).code !== 0) {
  fail("Docker is niet gevonden. Installeer Docker Desktop (https://www.docker.com/products/docker-desktop/), start het en voer dit script opnieuw uit.");
}
if (run("docker", ["info", "--format", "{{.ServerVersion}}"]).code !== 0) {
  fail("Docker is geïnstalleerd maar draait niet. Start Docker Desktop, wacht tot het 'running' meldt en voer dit script opnieuw uit.");
}
ok(`Docker ${run("docker", ["info", "--format", "{{.ServerVersion}}"]).out}`);

/** Haalt een image op; bij een Docker Hub-limiet via de Google-mirror. */
function ensureImage(image) {
  if (run("docker", ["image", "inspect", image]).code === 0) return true;
  info(`Image ${image} downloaden…`);
  if (run("docker", ["pull", image], { stdio: "inherit" }).code === 0) return true;
  const mirror = `mirror.gcr.io/${image.includes("/") ? image : `library/${image}`}`;
  info(`Opnieuw via ${mirror}…`);
  if (run("docker", ["pull", mirror], { stdio: "inherit" }).code === 0 && run("docker", ["tag", mirror, image]).code === 0) return true;
  return false;
}

// 2. Instellingen (.env)
let created = false;
if (!existsSync(envFile)) {
  const password = randomBytes(18).toString("base64url");
  const key = randomBytes(32).toString("base64");
  const example = readFileSync(path.join(webDir, ".env.example"), "utf8");
  const set = (text, name, value) => (new RegExp(`^${name}=.*$`, "m").test(text) ? text.replace(new RegExp(`^${name}=.*$`, "m"), `${name}=${value}`) : `${text}\n${name}=${value}\n`);
  let env = example;
  env = set(env, "DATABASE_URL", `postgres://studio:${password}@localhost:${DB_PORT}/ai_studio`);
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
const dbUrl = envText.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim() ?? "";
if (!/^[A-Za-z0-9+/=]{40,}$/.test(envText.match(/^APP_ENCRYPTION_KEY=(.*)$/m)?.[1]?.trim() ?? "")) {
  fail("APP_ENCRYPTION_KEY in apps/web/.env ontbreekt of is ongeldig. Verwijder apps/web/.env en voer dit script opnieuw uit, of vul de sleutel zelf in.");
}

// 3. Database in Docker (alleen als .env naar de meegeleverde database op poort 5433 wijst)
let url;
try {
  url = new URL(dbUrl);
} catch {
  fail("DATABASE_URL in apps/web/.env is ongeldig.");
}
if (["localhost", "127.0.0.1"].includes(url.hostname) && Number(url.port) === DB_PORT) {
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
    if (!ready) spawnSync(process.execPath, ["-e", "setTimeout(()=>{},1000)"]);
  }
  if (!ready) fail(`De database start niet. Bekijk de logboeken met: docker logs ${CONTAINER}`);
  ok(`PostgreSQL + pgvector draait in Docker (container "${CONTAINER}", poort ${DB_PORT})`);
} else {
  info(`DATABASE_URL wijst naar ${url.hostname}:${url.port || 5432}; die database beheer je zelf (pgvector vereist).`);
}

// 4. Sandbox-image voor AI Code
if (ensureImage(SANDBOX_IMAGE)) ok(`Sandbox-image ${SANDBOX_IMAGE} aanwezig (voor AI Code)`);
else console.warn(`\x1b[33m! Sandbox-image ${SANDBOX_IMAGE} niet beschikbaar; AI Code-commando's werken pas na: docker pull ${SANDBOX_IMAGE}\x1b[0m`);

// 5. Migraties
info("Database inrichten (migraties)…");
const mig = spawnSync("npm", ["run", "db:migrate"], { cwd: root, stdio: "inherit", shell: true });
if (mig.status !== 0) fail("Migraties mislukt (zie de melding hierboven).");

console.log(`
\x1b[32mKlaar!\x1b[0m Start AI WorkStudio Pro met:

  npm run dev

en open http://localhost:3000 in je browser. Bij de eerste keer maak je daar het beheerdersaccount aan.
Echte AI-antwoorden: Instellingen → AI-providers → Anthropic- of OpenAI-sleutel.
`);
