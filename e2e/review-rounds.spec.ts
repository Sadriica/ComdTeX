import { expect, test } from "@playwright/test"
import { installDeterminism } from "./support/deterministic"
import { installFakeVault } from "./support/fakeVault"

// Compare the open note with a review round: the difference opens as tracked
// changes in a read-only dialog. Git is the e2e fake (a canned round 1).

test("compare with round 1 shows the differences as tracked changes", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 })
  await installDeterminism(page)
  await page.addInitScript(() => {
    ;(window as unknown as { __FAKE_ROUNDS__: Record<string, string> }).__FAKE_ROUNDS__ = {
      "notes.md": "# Notes\n\nThe quick fox. Take $x^2 + 1$ here.\n",
    }
  })
  await installFakeVault(page, {
    settings: { theme: "vs-dark", language: "en" },
    git: "repo",
    tabs: ["notes.md"],
    files: { "notes.md": "# Notes\n\nThe slow fox. Take $x^2 + 2$ here.\n" },
    storage: { comdtex_deps_dismissed: JSON.stringify(["pandoc", "zip"]) },
  })
  await page.goto("/")
  await page.locator(".monaco-editor").first().waitFor({ timeout: 30_000 })
  await page.locator(".git-menu-item .menu-btn").click()
  await page.locator(".git-section-toggle", { hasText: "Review rounds" }).click()
  await expect(page.getByText("Round 1")).toBeVisible()
  await page.getByRole("button", { name: "Compare the open note with round 1" }).click()

  const dialog = page.getByRole("dialog", { name: /compared with round 1/ })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator("del.critic-del")).toHaveCount(2)
  await expect(dialog.locator("ins.critic-add")).toHaveCount(2)
  await expect(dialog.locator(".katex").first()).toBeVisible()
  await expect(dialog.locator("[contenteditable]")).toHaveCount(0)
  await page.keyboard.press("Escape")
  await expect(dialog).toHaveCount(0)
})
