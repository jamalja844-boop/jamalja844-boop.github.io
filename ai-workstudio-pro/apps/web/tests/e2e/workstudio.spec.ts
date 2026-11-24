import { tmpdir } from "node:os";
import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * AI WorkStudio Pro – eerste bruikbare route (fase 1):
 * inloggen → AI Chat → schrijfopdracht → opslaan → project openen → AI Code-taak → resultaten.
 * Draait na first-route.spec.ts (zelfde e2e-database en eigenaar). Model: demo-simulator,
 * duidelijk gemarkeerd als DEMO; de sandbox is echt (Docker, zonder netwerk).
 */
const EMAIL = "e2e-eigenaar@voorbeeld.nl";
const PASSWORD = "Groene-Emmer-2026";
let slug = "";

test.describe.configure({ mode: "serial" });

const STATE = `${tmpdir()}/workstudio-e2e-session.json`;

/** Hergebruikt de sessie uit test A (de inlog-rate-limit staat bewust maar 10 pogingen per 10 minuten toe). */
async function session(browser: Browser, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ storageState: STATE, viewport, locale: "nl-NL" });
  const page = await context.newPage();
  await page.goto(`/w/${slug}/chat`);
  return { page, context };
}

async function login(page: Page) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("E-mailadres").fill(EMAIL);
  await page.getByLabel("Wachtwoord").fill(PASSWORD);
  await page.getByRole("button", { name: "Inloggen" }).click();
  await page.waitForURL(/\/w\/[a-z0-9-]+\/chat/);
  slug = new URL(page.url()).pathname.split("/")[2];
}

const KORTING = "export const metKorting = (bedrag, pct) => Math.round(bedrag * (1 - pct / 100) * 100) / 100;\n";
const KORTING_TEST = "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { metKorting } from '../src/korting.js';\ntest('korting', () => assert.equal(metKorting(200, 10), 180));\n";
const SCRIPT = [
  "Voeg een kortingsfunctie toe en test die.",
  '/tool read_file {"path":"src/offerte.js"}',
  `/tool write_file ${JSON.stringify({ path: "src/korting.js", content: KORTING })}`,
  `/tool write_file ${JSON.stringify({ path: "test/korting.test.js", content: KORTING_TEST })}`,
  '/tool run_command {"command":"npm test"}',
  "/tool git_diff {}",
].join("\n");

test("A. inloggen opent AI Chat; /email maakt een e-mail die als document wordt opgeslagen en goedgekeurd", async ({ page }) => {
  await login(page);
  await page.context().storageState({ path: STATE });
  await expect(page.getByRole("heading", { name: "Waar kan ik je mee helpen?" })).toBeVisible();

  // Slash-opdracht met autocomplete
  const input = page.getByLabel("Bericht", { exact: true });
  await input.fill("/em");
  await expect(page.getByTestId("command-suggestions")).toContainText("/email");
  await input.press("Enter");
  await expect(input).toHaveValue("/email ");
  await input.pressSequentially("aan een nieuwe klant met een bevestiging van de intake");
  await input.press("Enter");

  const email = page.getByTestId("email-card");
  await expect(email).toBeVisible();
  await expect(page.getByTestId("email-subject")).not.toBeEmpty();
  await expect(email).toContainText("wordt niet automatisch verstuurd");
  await expect(page.getByText("DEMO").first()).toBeVisible();

  await page.getByTestId("save-document").last().click();
  await page.getByLabel("Titel", { exact: true }).fill("E2E intakebevestiging");
  await page.getByTestId("confirm-save").click();
  await expect(page.getByText("Opgeslagen in de Schrijfstudio")).toBeVisible();

  await page.goto(`/w/${slug}/writing`);
  await page.getByTestId("document-list").getByText("E2E intakebevestiging").click();
  await expect(page.getByTestId("doc-status")).toHaveText("Concept");
  await expect(page.getByTestId("doc-content")).toHaveValue(/^Onderwerp: /);
  await page.getByTestId("doc-approve").click();
  await expect(page.getByTestId("doc-status")).toHaveText("Goedgekeurd");
  const exported = await page.request.get(page.url().replace(/\/w\/[^/]+\/writing\?doc=/, `/api/w/${slug}/writing/documents/`) + "/export?format=md");
  expect(exported.ok()).toBe(true);
  expect(await exported.text()).toMatch(/^Onderwerp: /);
});

test("B. project openen, npm test in de sandbox en een AI Code-taak met diff", async ({ browser }) => {
  const { page, context } = await session(browser);
  const res = await page.request.get(`/api/w/${slug}/code/projects`);
  const { sandbox } = await res.json();
  test.skip(!sandbox.available, `Docker-sandbox niet beschikbaar: ${sandbox.reason}`);

  await page.goto(`/w/${slug}/code`);
  // Zonder OAuth-app op de server meldt de GitHub-kaart eerlijk wat ontbreekt (geen nepknop).
  await expect(page.getByTestId("github-card")).toContainText("GITHUB_CLIENT_ID");
  await expect(page.getByTestId("github-card").getByRole("link", { name: /GitHub koppelen/ })).toHaveCount(0);
  await page.getByTestId("new-project").click();
  await page.getByLabel("Naam").fill("E2E Offertecalculator");
  await page.getByTestId("create-project").click();
  await page.waitForURL(/\/code\/[0-9a-f-]{36}/);
  await expect(page.getByTestId("file-tree")).toContainText("offerte.js");

  // Terminal in de sandbox
  await page.getByLabel("Commando", { exact: true }).fill("npm test");
  await page.getByTestId("run-command").click();
  await expect(page.getByTestId("terminal-output")).toContainText("# pass 3", { timeout: 60_000 });
  await expect(page.getByTestId("terminal-output")).toContainText("exitcode 0");

  // AI Code-taak (demo-model voert een vast script uit; tools en sandbox zijn echt)
  await page.getByLabel("Opdracht voor AI Code").fill(SCRIPT);
  await page.getByLabel("Model", { exact: true }).selectOption("demo::demo-simulator");
  await page.getByTestId("start-task").click();
  const task = page.getByTestId("code-task");
  await expect(task).toHaveAttribute("data-status", "succeeded", { timeout: 60_000 });
  await expect(page.getByTestId("changed-files")).toContainText("src/korting.js");
  await expect(page.getByTestId("changed-files")).toContainText("test/korting.test.js");
  await expect(task.locator('[data-kind="command"]')).toContainText("exitcode 0");
  await expect(page.getByTestId("diff-view").first()).toContainText("+export const metKorting");
  await expect(page.getByTestId("file-tree")).toContainText("korting.js");
  await context.close();
});

test("C. /code vanuit AI Chat start een taak in het gekoppelde project", async ({ browser }) => {
  const { page, context } = await session(browser);
  const res = await page.request.get(`/api/w/${slug}/code/projects`);
  const { sandbox } = await res.json();
  test.skip(!sandbox.available, "Docker-sandbox niet beschikbaar");

  await page.getByTestId("new-chat").click();
  await page.getByLabel("Project", { exact: true }).selectOption({ label: "E2E Offertecalculator" });
  await page.getByLabel("Bericht", { exact: true }).fill('/code draai de tests\n/tool run_command {"command":"npm test"}');
  await page.getByRole("button", { name: "Versturen" }).click();
  const card = page.getByTestId("code-task-card");
  await expect(card).toBeVisible();
  await expect(card.getByTestId("code-task")).toHaveAttribute("data-status", "succeeded", { timeout: 60_000 });

  await page.goto(`/w/${slug}`);
  for (const step of ["Schrijfopdracht in AI Chat", "Resultaat opslaan als document", "Project openen in AI Code", "AI Code-taak uitvoeren"]) {
    await expect(page.locator("li", { hasText: step }).locator("span.line-through")).toBeVisible();
  }
  await context.close();
});

test("E. Cowork: CSV-bijlage in AI Chat wordt een Excel-bestand om te downloaden", async ({ browser }) => {
  const { page, context } = await session(browser);
  await page.getByTestId("new-chat").click();
  await page.getByTestId("attach-input").setInputFiles({ name: "uren.csv", mimeType: "text/csv", buffer: Buffer.from("Medewerker;Object;Uren\nFatima;Kantoor Zeist;7,5\nJohan;School Utrecht;6\n") });
  await expect(page.getByTestId("pending-attachments")).toContainText("uren.csv");
  await page.getByRole("button", { name: "Naar Excel" }).click();
  const card = page.getByTestId("file-card");
  await expect(card).toBeVisible();
  await expect(card).toContainText(".xlsx");
  const href = await card.getAttribute("href");
  const res = await page.request.get(href!);
  expect(res.ok()).toBe(true);
  expect(res.headers()["content-type"]).toContain("spreadsheetml");
  expect((await res.body()).subarray(0, 2).toString()).toBe("PK");
  await expect(page.getByTestId("msg-user").last()).toContainText("uren.csv");
  await context.close();
});

test("F. Schrijfstudio: document als Word en PDF downloaden; antwoord uit de chat als Word", async ({ browser }) => {
  const { page, context } = await session(browser);
  await page.goto(`/w/${slug}/writing`);
  await page.getByTestId("document-list").getByText("E2E intakebevestiging").click();
  for (const [id, type, magic] of [["export-docx", "wordprocessingml", "PK"], ["export-pdf", "application/pdf", "%PDF-"]] as const) {
    const href = await page.getByTestId(id).getAttribute("href");
    const res = await page.request.get(href!);
    expect(res.ok(), id).toBe(true);
    expect(res.headers()["content-type"]).toContain(type);
    expect((await res.body()).subarray(0, magic.length).toString()).toBe(magic);
  }
  const xlsx = await page.request.get((await page.getByTestId("export-xlsx").getAttribute("href"))!);
  expect(xlsx.status()).toBe(409); // dit document bevat geen tabellen
  await context.close();
});

test("G. Taakplanner: taak inplannen, nu uitvoeren en het concept openen", async ({ browser }) => {
  const { page, context } = await session(browser);
  await page.goto(`/w/${slug}/cowork?tab=planner`);
  await page.getByTestId("new-schedule").click();
  await page.getByLabel("Naam", { exact: true }).fill("E2E weekbericht");
  await page.getByLabel("Opdracht", { exact: true }).fill("/email aan het team met de planning voor volgende week");
  await page.getByLabel("Herhaling").selectOption("weekly");
  await page.getByLabel("Dag", { exact: true }).selectOption("1");
  await page.getByLabel("Tijd", { exact: true }).fill("08:15");
  await page.getByTestId("save-schedule").click();
  const item = page.getByTestId("schedule-list").locator("li", { hasText: "E2E weekbericht" }).first();
  await expect(item).toContainText("Elke maandag om 08:15");
  await item.getByTestId("run-now").click();
  await expect(item.locator('[data-status="succeeded"]')).toBeVisible({ timeout: 60_000 });
  await item.getByRole("link", { name: /E2E weekbericht/ }).click();
  await expect(page.getByTestId("doc-status")).toHaveText("Concept");
  await expect(page.getByTestId("doc-content")).toHaveValue(/^Onderwerp: /);
  await context.close();
});

test("D. mobiel: AI Chat zonder horizontaal scrollen", async ({ browser }) => {
  const { page, context } = await session(browser, { width: 390, height: 844 });
  await expect(page.getByLabel("Bericht", { exact: true })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
  await context.close();
});
