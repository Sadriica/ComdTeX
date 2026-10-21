import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  // The visual harness is slow; it only joins the run with VISUAL=1 (see playwright.visual.config.ts).
  testIgnore: process.env.VISUAL === "1" ? [] : /visual\.spec\.ts/,
  timeout: 30_000,
  // Each worker runs its own Chrome with Monaco, KaTeX and Mermaid. Unbounded
  // parallelism starved widgets of CPU and made "is visible" checks flaky, so
  // the pool is capped and visibility gets more room. No retries: a failure
  // should be real.
  workers: process.env.CI ? 2 : 4,
  expect: { timeout: 10_000 },
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
