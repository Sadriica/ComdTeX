import { defineConfig } from "@playwright/test"
import base from "./playwright.config"

// Visual harness config: same dev server and projects as the default one, but
// drives the system Chrome (Playwright's bundled Chromium is not installed on
// every machine). Run with: VISUAL=1 npx playwright test -c playwright.visual.config.ts
export default defineConfig({
  ...base,
  testMatch: /visual\.spec\.ts/,
  testIgnore: [],
  timeout: 120_000,
  workers: 1,
  use: { ...base.use, channel: "chrome", actionTimeout: 8_000 },
})
