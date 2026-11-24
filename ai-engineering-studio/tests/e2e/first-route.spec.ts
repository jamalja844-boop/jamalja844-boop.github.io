import { expect, test, type Page } from "@playwright/test";

const EMAIL = "e2e-eigenaar@voorbeeld.nl";
const PASSWORD = "Groene-Emmer-2026";
let slug = "";

test.describe.configure({ mode: "serial" });

async function login(page: Page) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("E-mailadres").fill(EMAIL);
  await page.getByLabel("Wachtwoord").fill(PASSWORD);
  await page.getByRole("button", { name: "Inloggen" }).click();
  await page.waitForURL(/\/w\/[a-z0-9-]+/);
}

test("1. installatie: eerste beheerder en workspace", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/setup/);
  await page.getByLabel("Je naam").fill("Jamal E2E");
  await page.getByLabel("E-mailadres").fill(EMAIL);
  await page.getByLabel("Wachtwoord").fill(PASSWORD);
  await page.getByLabel("Naam van je organisatie").fill("E2E Schoonmaak");
  await page.getByRole("button", { name: "Installatie voltooien" }).click();
  await page.waitForURL(/\/w\/e2e-schoonmaak/);
  slug = new URL(page.url()).pathname.split("/")[2];
  await expect(page.getByRole("heading", { name: /Goedendag, Jamal/ })).toBeVisible();
  await expect(page.getByText("Nog geen AI-provider gekoppeld")).toBeVisible();
});

test("2. uitloggen, onjuist wachtwoord en weer inloggen", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Uitloggen" }).click();
  await page.waitForURL(/\/login/);
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("E-mailadres").fill(EMAIL);
  await page.getByLabel("Wachtwoord").fill("fout-wachtwoord-1");
  await page.getByRole("button", { name: "Inloggen" }).click();
  await expect(page.getByText("Onjuist e-mailadres of wachtwoord")).toBeVisible();
  await login(page);
  // Zonder sessie is een workspace niet bereikbaar.
  await page.context().clearCookies();
  await page.goto(`/w/${slug}`);
  await expect(page).toHaveURL(/\/login/);
});

test("3. AI-model configureren", async ({ page }) => {
  await login(page);
  await page.goto(`/w/${slug}/settings?tab=providers`);
  await expect(page.getByText("Anthropic (Claude)").first()).toBeVisible();
  await expect(page.getByText("Niet ingesteld").first()).toBeVisible();
  await page.getByRole("tab", { name: "Modellen" }).click();
  const row = page.locator("tr", { hasText: "demo-simulator" });
  await row.getByLabel("Standaardmodel").check();
  await expect(row.getByLabel("Standaardmodel")).toBeChecked();
});

test("4. prompt aanmaken met nieuwe versie", async ({ page }) => {
  await login(page);
  await page.goto(`/w/${slug}/prompts`);
  await page.getByRole("button", { name: "Nieuwe prompt" }).click();
  await page.getByLabel("Naam").fill("Rekenassistent");
  await page.getByRole("button", { name: "Aanmaken" }).click();
  await page.waitForURL(/\/prompts\/[0-9a-f-]{36}/);
  await page.getByLabel("Rol").fill("Nauwkeurige rekenassistent voor offertes");
  await page.getByLabel("Doel").fill("Bedragen exact berekenen");
  await page.getByRole("button", { name: "Opslaan als nieuwe versie" }).click();
  await expect(page.getByText("Versie 2 opgeslagen")).toBeVisible();
});

test("5-7. chatten, een tool uitvoeren en het resultaat opslaan", async ({ page }) => {
  await login(page);
  await page.goto(`/w/${slug}/llm`);
  await page.locator("#model").selectOption("demo::demo-simulator");
  await page.locator("#prompt").selectOption({ label: "Rekenassistent (v2)" });
  await expect(page.locator("#system")).toHaveValue(/Nauwkeurige rekenassistent/);
  await page.getByLabel("Rekenmachine").check();
  await page.getByLabel("Bericht").fill('/tool calculator {"expression":"120 * 4.5 * 1.21"}');
  await page.getByRole("button", { name: "Versturen" }).click();

  const toolCard = page.getByTestId("tool-card").first();
  await expect(toolCard).toContainText("calculator");
  await expect(toolCard).toContainText("uitgevoerd");
  await expect(page.getByTestId("assistant-message").last()).toContainText("653.4");

  await page.getByTestId("save-result").last().click();
  await expect(page.getByText(/Resultaat opgeslagen/)).toBeVisible();

  await page.goto(`/w/${slug}/tools?tab=records`);
  await expect(page.locator("td", { hasText: "ai_resultaten" }).first()).toBeVisible();

  await page.goto(`/w/${slug}`);
  await expect(page.getByText("API-verbruik", { exact: true })).toBeVisible();
  for (const step of ["Prompt aanmaken", "Chatten in LLM Studio", "Een tool uitvoeren", "Resultaat opslaan"]) {
    await expect(page.locator("li", { hasText: step }).locator("span.line-through")).toBeVisible();
  }
});

test("mobiel: zijmenu en dashboard werken op een smal scherm", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await login(page);
  await page.getByRole("button", { name: "Menu openen" }).click();
  await page.getByRole("link", { name: /Prompt Studio/ }).last().click();
  await expect(page).toHaveURL(/\/prompts/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
  await context.close();
});
