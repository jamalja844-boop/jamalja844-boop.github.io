import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgres://studio:studio@localhost:5432/ai_studio_e2e";

/**
 * End-to-end: draait tegen een productiebuild (`npm run build` eerst) met een aparte database.
 *   npm run build && npm run test:e2e
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${PORT}`, trace: "off", locale: "nl-NL", timezoneId: "Europe/Amsterdam" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    port: PORT,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: E2E_DB,
      APP_URL: `http://localhost:${PORT}`,
      APP_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
      ENABLE_DEMO_PROVIDER: "true",
      ALLOW_SIGNUP: "false",
      NODE_ENV: "production",
    },
  },
});
