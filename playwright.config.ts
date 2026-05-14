import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT || 4173);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: `node tests/e2e/server.cjs`,
    url: `${baseURL}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: { E2E_PORT: String(port) },
  },
});
