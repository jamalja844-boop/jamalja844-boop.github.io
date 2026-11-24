import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import type { CommandResult } from "@workstudio/shared";

export interface SandboxOptions {
  image: string;
  network: boolean;
  timeoutMs: number;
  memoryMb: number;
  cpus: number;
  /** Doorgeven van HTTP(S)_PROXY naar de container als netwerk is toegestaan. */
  passProxy?: boolean;
}

export const DEFAULT_SANDBOX: SandboxOptions = { image: "node:22-alpine", network: false, timeoutMs: 120_000, memoryMb: 1024, cpus: 1 };

const MAX_OUTPUT = 200_000;

/** Herkent commando's die pakketten installeren (vereisen netwerk en dus toestemming). */
export function isInstallCommand(command: string): boolean {
  return /\b(npm\s+(i|install|ci|add)|pnpm\s+(i|install|add)|yarn(\s+(add|install))?\s*($|&&|;|\s)|bun\s+(add|install)|pip3?\s+install|poetry\s+(add|install)|composer\s+(install|require)|apk\s+add|apt(-get)?\s+install|gem\s+install|cargo\s+(add|install)|go\s+get)\b/i.test(command);
}

/** Commando's die nooit in de sandbox worden uitgevoerd (ook niet met toestemming). */
export function forbiddenReason(command: string): string | null {
  if (/\b(docker|podman|nsenter|mount|sudo|su\s)\b/.test(command)) return "Container- of rechtenwijzigende commando's zijn niet toegestaan in de sandbox";
  if (command.length > 2000) return "Commando is te lang";
  return null;
}

function runFile(cmd: string, args: string[], timeoutMs = 15_000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 4_000_000 }, (err, stdout, stderr) => {
      const code = err ? ((err as NodeJS.ErrnoException & { code?: number | string }).code === "ENOENT" ? 127 : typeof (err as { code?: unknown }).code === "number" ? ((err as { code: number }).code) : 1) : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

/** Controleert of Docker en het sandbox-image beschikbaar zijn. */
export async function checkSandbox(image: string): Promise<{ available: boolean; reason: string | null; dockerVersion: string | null }> {
  const v = await runFile("docker", ["version", "--format", "{{.Server.Version}}"]);
  if (v.code !== 0) {
    return { available: false, reason: v.code === 127 ? "Docker is niet geïnstalleerd op de server" : "De Docker-daemon is niet bereikbaar", dockerVersion: null };
  }
  const img = await runFile("docker", ["image", "inspect", image, "--format", "{{.Id}}"]);
  if (img.code !== 0) return { available: false, reason: `Sandbox-image ${image} ontbreekt. Voer uit: docker pull ${image}`, dockerVersion: v.stdout.trim() };
  return { available: true, reason: null, dockerVersion: v.stdout.trim() };
}

/** Gebruikers-ID in de container: nooit root. */
export function sandboxUid(): string {
  const uid = typeof process.getuid === "function" ? process.getuid() : 1000;
  const gid = typeof process.getgid === "function" ? process.getgid() : 1000;
  return uid === 0 ? "1000:1000" : `${uid}:${gid}`;
}

/** Bij een server die als root draait moet de projectmap eigendom zijn van de sandboxgebruiker. */
export async function prepareProjectDir(projectDir: string) {
  if (typeof process.getuid === "function" && process.getuid() === 0) {
    await runFile("chown", ["-R", "-h", "1000:1000", projectDir], 60_000); // -h: links zelf, nooit hun doel
  }
}

export function sandboxArgs(projectDir: string, command: string, opts: SandboxOptions, name: string): string[] {
  const args = [
    "run", "--rm", "--init", "--name", name,
    "--network", opts.network ? "bridge" : "none",
    "--memory", `${opts.memoryMb}m`, "--memory-swap", `${opts.memoryMb}m`,
    "--cpus", String(opts.cpus), "--pids-limit", "512",
    "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
    "--read-only", "--tmpfs", "/tmp:rw,exec,size=512m", "--tmpfs", "/home/sandbox:rw,exec,size=256m",
    "-e", "HOME=/home/sandbox", "-e", "npm_config_cache=/tmp/.npm", "-e", "CI=1", "-e", "FORCE_COLOR=0",
    "--user", sandboxUid(),
    "-v", `${projectDir}:/workspace:rw`, "-w", "/workspace",
  ];
  if (opts.network && opts.passProxy) {
    for (const k of ["HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "https_proxy", "http_proxy", "no_proxy"]) {
      if (process.env[k]) args.push("-e", `${k}=${process.env[k]}`);
    }
  }
  args.push(opts.image, "sh", "-lc", command);
  return args;
}

/**
 * Voert een commando uit in een wegwerpcontainer: geen netwerk (tenzij toegestaan),
 * alleen de projectmap gemount, alleen-lezen rootbestandssysteem, geen extra rechten,
 * limieten op geheugen, CPU, processen en tijd.
 */
export async function runInSandbox(projectDir: string, command: string, options: Partial<SandboxOptions> = {}): Promise<CommandResult> {
  const opts = { ...DEFAULT_SANDBOX, ...options };
  const forbidden = forbiddenReason(command);
  if (forbidden) throw new Error(forbidden);
  const name = `ws-sbx-${randomBytes(6).toString("hex")}`;
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn("docker", sandboxArgs(projectDir, command, opts, name), { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const append = (cur: string, chunk: Buffer) => (cur.length >= MAX_OUTPUT ? cur : (cur + chunk.toString("utf8")).slice(0, MAX_OUTPUT));
    child.stdout.on("data", (c: Buffer) => (stdout = append(stdout, c)));
    child.stderr.on("data", (c: Buffer) => (stderr = append(stderr, c)));
    const timer = setTimeout(() => {
      timedOut = true;
      execFile("docker", ["kill", name], () => {});
    }, opts.timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Sandbox kon niet starten: ${err.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ exitCode: timedOut ? null : code, stdout, stderr: timedOut ? `${stderr}\n[Tijdslimiet van ${opts.timeoutMs / 1000} s overschreden – proces gestopt]` : stderr, durationMs: Date.now() - started, timedOut, network: opts.network });
    });
  });
}
