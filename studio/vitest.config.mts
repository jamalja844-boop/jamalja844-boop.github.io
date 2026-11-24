import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts"], testTimeout: 30000, env: { ENCRYPTION_KEY: "0".repeat(64), SESSION_SECRET: "test-secret-test-secret-test-secret-123", STORAGE_DIR: path.join(__dirname, "storage-test") } },
  resolve: { alias: { "@": path.join(__dirname, "src") } },
});
