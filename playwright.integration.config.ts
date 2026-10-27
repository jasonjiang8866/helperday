import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./integration/specs",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  outputDir: "test-results/integration",
  reporter: [
    ["list"],
    ["junit", { outputFile: "test-results/integration-junit.xml" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:4173",
    // Traces/HARs may contain Auth tokens. Keep only assertions in CI artifacts.
    trace: "off",
    screenshot: "off",
    video: "off",
    viewport: { width: 1440, height: 1100 },
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
          args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
        }
      : undefined,
  },
  webServer: {
    command: "node scripts/serve-web.mjs",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
  },
});
