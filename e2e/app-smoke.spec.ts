import { expect, test } from "@playwright/test"

// ComdTeX is a Tauri app: outside a real Tauri runtime, `window.__TAURI_INTERNALS__`
// is undefined. Most Tauri calls in App.tsx/useVault.ts are already defensively
// wrapped (e.g. `currentTauriWindow()` try/catches `getCurrentWindow()`, and
// `checkDeps.ts` try/catches `Command.create(...).execute()`), so the app
// currently mounts fine in a plain browser. This stub is defense-in-depth: it
// makes `invoke`/`transformCallback`/window-or-webview metadata resolve to
// benign values instead of throwing, so a future *unguarded* Tauri call doesn't
// silently break the whole e2e suite.
async function stubTauriInternals(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    // Minimal shape read by @tauri-apps/api/core.js, window.js, webview.js:
    // - invoke(cmd, args, options) -> Promise
    // - transformCallback(callback, once) -> numeric id
    // - metadata.currentWindow.label / metadata.currentWebview.label
    ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
      invoke: () => Promise.resolve(null),
      transformCallback: () => 0,
      metadata: {
        currentWindow: { label: "main" },
        currentWebview: { label: "main" },
      },
    }
  })
}

test("renders the initial ComdTeX shell", async ({ page }) => {
  await stubTauriInternals(page)
  await page.goto("/")
  await expect(page.locator(".welcome-logo")).toContainText("ComdTeX")
  await expect(page.getByText(/Markdown \+ LaTeX|Markdown \+ LaTeX/i)).toBeVisible()
  await expect(page.getByRole("button", { name: /Abrir carpeta existente|Open existing folder/ })).toBeVisible()
})

test("Ctrl+P opens the command palette even before a vault is loaded", async ({ page }) => {
  await stubTauriInternals(page)
  await page.goto("/")
  await expect(page.locator(".welcome-logo")).toBeVisible()

  await page.keyboard.press("Control+p")

  await expect(page.locator(".palette-overlay")).toBeVisible()
  await expect(page.locator(".palette-input")).toBeVisible()

  // Escape should close it again without crashing the app.
  await page.keyboard.press("Escape")
  await expect(page.locator(".palette-overlay")).toHaveCount(0)
  await expect(page.locator(".welcome-logo")).toBeVisible()
})
