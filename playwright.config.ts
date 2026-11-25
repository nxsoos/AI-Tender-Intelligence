import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Full Chromium renders PDFs in new headless mode; the default shell downloads them.
        channel: process.platform === "win32" ? "chrome" : "chromium",
      },
    },
  ],
  webServer: {
    command: "node scripts/start-browser-tests.mjs",
    // Warm the dashboard route before opening a browser. The API route alone
    // becomes ready before Next has compiled the page and its client bundles.
    url: "http://127.0.0.1:3100/",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_TEST_DIST_DIR: "1",
      NEXT_PUBLIC_SUPABASE_URL: "https://fixture.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-publishable-key",
      SUPABASE_SECRET_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      GEMINI_API_KEY: "",
    },
  },
});
