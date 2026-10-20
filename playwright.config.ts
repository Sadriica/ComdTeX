import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  // The visual harness is slow; it only joins the run with VISUAL=1 (see playwright.visual.config.ts).
  testIgnore: process.env.VISUAL === "1" ? [] : /visual\.spec\.ts/,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:1420",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1",
    url: "http://127.0.0.1:1420",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
