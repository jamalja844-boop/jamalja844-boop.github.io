// One-command start for a local computer (Windows, macOS, Linux):
// checks Node/FFmpeg, installs packages, creates .env.local with secure keys, builds once,
// then runs the web app + render/post worker and opens the browser.
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const win = process.platform === "win32";
const npm = win ? "npm.cmd" : "npm";
const say = (m) => console.log(`\n▶ ${m}`);
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: win });
  if (r.status !== 0) {
    console.error(`\n✖ "${cmd} ${args.join(" ")}" failed. See the messages above.`);
    process.exit(1);
  }
};

const major = Number(process.versions.node.split(".")[0]);
if (major < 22) {
  console.error(`✖ Node.js ${process.versions.node} is too old. Install Node.js 22 LTS or newer from https://nodejs.org and run this again.`);
  process.exit(1);
}
const ff = spawnSync("ffprobe", ["-version"], { shell: win });
if (ff.status !== 0) {
  console.error("✖ FFmpeg is not installed (needed for audio/video).\n  Windows: winget install Gyan.FFmpeg   (then open a NEW terminal)\n  macOS:   brew install ffmpeg\n  Linux:   sudo apt install ffmpeg");
  process.exit(1);
}

if (!fs.existsSync("node_modules")) {
  say("Installing packages (first time only, a few minutes)…");
  run(npm, ["install", "--no-audit", "--no-fund"]);
}
if (!fs.existsSync(".env.local")) {
  say("Creating .env.local with new secret keys…");
  const hex = () => crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(".env.local", `ENCRYPTION_KEY=${hex()}\nSESSION_SECRET=${hex()}\nAPP_URL=http://localhost:3000\n`);
}
const stamp = ".next/BUILD_ID";
const newest = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((m, e) => {
  const p = path.join(dir, e.name);
  return Math.max(m, e.isDirectory() ? newest(p) : fs.statSync(p).mtimeMs);
}, 0);
if (!fs.existsSync(stamp) || newest("src") > fs.statSync(stamp).mtimeMs) {
  say("Building the app (first time only, 1–3 minutes)…");
  run(npm, ["run", "build"]);
}

say("Starting AI Video Ads Studio on http://localhost:3000 (close this window to stop)");
const web = spawn(npm, ["start"], { stdio: "inherit", shell: win });
const worker = spawn(npm, ["run", "worker"], { stdio: "inherit", shell: win });
const stop = () => { web.kill(); worker.kill(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
web.on("exit", stop);

// open the browser once the server answers
const open = win ? ["cmd", ["/c", "start", "", "http://localhost:3000"]] : process.platform === "darwin" ? ["open", ["http://localhost:3000"]] : ["xdg-open", ["http://localhost:3000"]];
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  try {
    const r = await fetch("http://localhost:3000/login");
    if (r.ok) {
      spawn(open[0], open[1], { stdio: "ignore", detached: true }).on("error", () => {});
      console.log("\n✔ Ready: http://localhost:3000  — create an account on the first visit.");
      break;
    }
  } catch {
    /* not up yet */
  }
}
