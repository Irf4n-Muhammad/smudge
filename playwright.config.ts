import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    viewport: { width: 1440, height: 1050 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node scripts/dev.mjs",
      // Through the web app to the API, so tests start only once the demo content is seeded.
      url: "http://127.0.0.1:3000/api/auth/state",
      timeout: 180000,
      reuseExistingServer: false,
      env: {
        FORMA_DATA_DIR: resolve(".local/e2e"),
        NEXT_TELEMETRY_DISABLED: "1",
        // The website import may read the local trial sites below, and nothing else private.
        FORMA_IMPORT_ALLOW_HOSTS: "127.0.0.1:3010",
      },
    },
    {
      command: "node tests/fixtures/sites/serve.mjs",
      url: "http://127.0.0.1:3010",
      reuseExistingServer: false,
      env: { PORT: "3010" },
    },
  ],
});
