import { expect, test, type Page } from "@playwright/test"
import { installDeterminism } from "./support/deterministic"
import { installFakeVault } from "./support/fakeVault"

// Ctrl+K is the inline AI edit only while the AI assistant is on; otherwise
// Monaco's Ctrl+K chords (fold all, unfold all) must keep working.

async function openEditor(page: Page, aiEnabled: boolean) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await installDeterminism(page)
  await installFakeVault(page, {
    settings: { theme: "vs-dark", aiEnabled },
    tabs: ["papers/spectral-gap.md"],
    storage: { comdtex_deps_dismissed: JSON.stringify(["pandoc", "zip"]) },
  })
  await page.goto("/")
  await page.locator(".monaco-editor").first().waitFor({ timeout: 30_000 })
  await page.locator(".monaco-editor .view-line").first().click()
}

test("with AI off, Ctrl+K Ctrl+0 folds and Ctrl+K Ctrl+J unfolds", async ({ page }) => {
  await openEditor(page, false)
  const lines = page.locator(".monaco-editor .view-line")
  const before = await lines.count()
  await page.keyboard.press("Control+k")
  await page.keyboard.press("Control+0")
  await expect.poll(() => lines.count()).toBeLessThan(before)
  await page.keyboard.press("Control+k")
  await page.keyboard.press("Control+j")
  await expect.poll(() => lines.count()).toBe(before)
})

test("with AI on, Ctrl+K opens the inline edit", async ({ page }) => {
  await openEditor(page, true)
  await page.keyboard.press("Control+k")
  await expect(page.locator(".cmdk-edit, [class*='cmdk']").first()).toBeVisible()
})
