import { describe, expect, it } from "vitest";
import { commandSuggestions, normalizeLanguage, parseSlashCommand } from "@workstudio/shared";
import { forbiddenReason, isInstallCommand, resolveInside, sandboxArgs, WorkspaceError } from "@workstudio/code-execution";
import { parseEmail } from "@/lib/writing/service";
import { parseToolScript } from "@/lib/ai/providers/demo";

describe("slash-opdrachten", () => {
  it("herkent opdrachten met tekst en argumenten", () => {
    expect(parseSlashCommand("/email aan de klant over de offerte")).toEqual({ name: "email", arg: null, body: "aan de klant over de offerte" });
    expect(parseSlashCommand("/translate engels Goedemorgen allemaal")).toEqual({ name: "translate", arg: "engels", body: "Goedemorgen allemaal" });
    expect(parseSlashCommand("/translate Goedemorgen")).toEqual({ name: "translate", arg: null, body: "Goedemorgen" });
    expect(parseSlashCommand("/humanize")).toEqual({ name: "humanize", arg: null, body: "" });
    expect(parseSlashCommand("  /CODE voeg een test toe")?.name).toBe("code");
  });
  it("negeert onbekende opdrachten en gewone tekst", () => {
    expect(parseSlashCommand("/onbekend iets")).toBeNull();
    expect(parseSlashCommand("Hoe gaat het? /email")).toBeNull();
    expect(parseSlashCommand("/ email")).toBeNull();
  });
  it("normaliseert talen en geeft suggesties", () => {
    expect(normalizeLanguage("EN")).toBe("Engels");
    expect(normalizeLanguage("duits")).toBe("Duits");
    expect(normalizeLanguage("klingon")).toBeNull();
    expect(commandSuggestions("/tr").map((c) => c.name)).toEqual(["translate"]);
    expect(commandSuggestions("/").length).toBe(10);
  });
});

describe("e-mail uit AI-tekst", () => {
  it("haalt onderwerp en tekst eruit, ook met demo-label of vetgedrukt onderwerp", () => {
    expect(parseEmail("Onderwerp: Offerte kantoor\n\nBeste Jan,\n\nGroet")).toEqual({ subject: "Offerte kantoor", body: "Beste Jan,\n\nGroet" });
    expect(parseEmail("[DEMO – geen echte AI]\n**Onderwerp:** Intake\n\nBeste klant").subject).toBe("Intake");
    expect(parseEmail("Subject: Quote\n\nDear John").subject).toBe("Quote");
    expect(parseEmail("Beste klant, dank voor uw bericht.").body).toBe("Beste klant, dank voor uw bericht.");
  });
});

describe("werkmap-beveiliging", () => {
  const root = "/srv/workspaces/org/project";
  it("staat alleen paden binnen het project toe", () => {
    expect(resolveInside(root, "src/a.js")).toBe(`${root}/src/a.js`);
    expect(resolveInside(root, "./src/../README.md")).toBe(`${root}/README.md`);
    // Een absoluut pad wordt binnen het project geplaatst, nooit op het hostsysteem.
    expect(resolveInside(root, "/etc/passwd")).toBe(`${root}/etc/passwd`);
  });
  it("weigert paden buiten het project en de .git-map", () => {
    for (const bad of ["../ander/a.js", "src/../../x", "..\\..\\x", ".git/config", "src/.git/hooks/pre-commit", "a\0b"]) {
      expect(() => resolveInside(root, bad), bad).toThrow(WorkspaceError);
    }
  });
});

describe("sandboxregels", () => {
  it("herkent installatiecommando's (vragen netwerk en toestemming)", () => {
    for (const c of ["npm install", "npm i lodash", "npm ci", "pnpm add zod", "yarn add react", "pip install requests", "apk add git", "cd app && npm install"]) {
      expect(isInstallCommand(c), c).toBe(true);
    }
    for (const c of ["npm test", "npm run build", "node src/index.js", "ls -la", "npx vitest run"]) {
      expect(isInstallCommand(c), c).toBe(false);
    }
  });
  it("blokkeert container- en rechtenopdrachten", () => {
    expect(forbiddenReason("docker ps")).toMatch(/niet toegestaan/);
    expect(forbiddenReason("sudo rm -rf /")).toMatch(/niet toegestaan/);
    expect(forbiddenReason("npm test")).toBeNull();
    expect(forbiddenReason("x".repeat(2001))).toMatch(/te lang/);
  });
  it("start containers afgeschermd: geen netwerk, geen rechten, alleen-lezen, limieten", () => {
    const args = sandboxArgs("/p", "npm test", { image: "node:22-alpine", network: false, timeoutMs: 1000, memoryMb: 512, cpus: 1 }, "ws-test");
    const joined = args.join(" ");
    expect(joined).toContain("--network none");
    expect(joined).toContain("--cap-drop ALL");
    expect(joined).toContain("--security-opt no-new-privileges");
    expect(joined).toContain("--read-only");
    expect(joined).toContain("--memory 512m");
    expect(joined).toContain("--pids-limit 512");
    expect(args).toContain("/p:/workspace:rw");
    expect(args.slice(-3)).toEqual(["sh", "-lc", "npm test"]);
    expect(sandboxArgs("/p", "npm i", { image: "x", network: true, timeoutMs: 1, memoryMb: 1, cpus: 1 }, "n").join(" ")).toContain("--network bridge");
  });
});

describe("demo-provider scripts", () => {
  it("leest meerdere /tool-regels als script", () => {
    const s = parseToolScript('Doe dit.\n/tool read_file {"path":"a.js"}\n/tool run_command {"command":"npm test"}\n/tool git_diff {}');
    expect(s).toEqual([
      { name: "read_file", input: { path: "a.js" } },
      { name: "run_command", input: { command: "npm test" } },
      { name: "git_diff", input: {} },
    ]);
  });
});

describe("symbolische links in projectmappen", () => {
  it("leest of schrijft nooit via een link naar buiten het project", async () => {
    const { mkdtemp, mkdir, symlink, writeFile, readFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { readText, writeText } = await import("@workstudio/code-execution");
    const base = await mkdtemp(`${tmpdir()}/ws-link-`);
    const root = `${base}/project`;
    const outside = `${base}/buiten`;
    await mkdir(root);
    await mkdir(outside);
    await writeFile(`${outside}/geheim.txt`, "geheim");
    await symlink(outside, `${root}/link`);
    await symlink(`${outside}/nieuw.txt`, `${root}/hangend.txt`);
    await expect(readText(root, "link/geheim.txt")).rejects.toThrow(/buiten het project/);
    await expect(writeText(root, "link/sub/x.txt", "x")).rejects.toThrow(/buiten het project/);
    await expect(writeText(root, "hangend.txt", "x")).rejects.toThrow(/symbolische link/);
    await expect(readFile(`${outside}/nieuw.txt`)).rejects.toThrow();
    expect((await writeText(root, "src/ok.txt", "ok")).created).toBe(true);
  });
});
