import { expect, test, type Page } from "@playwright/test"
import { installDeterminism } from "./support/deterministic"
import { installFakeVault } from "./support/fakeVault"

// Clicking in the preview moves the editor there; moving the editor cursor
// brings the matching preview block into view. Both rely on data-source-line,
// which must survive math, citations, references and labelled headings.

async function open(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await installDeterminism(page)
  await installFakeVault(page, {
    settings: { theme: "vs-dark" },
    tabs: ["papers/spectral-gap.md"],
    storage: { comdtex_deps_dismissed: JSON.stringify(["pandoc", "zip"]) },
  })
  await page.goto("/")
  await page.locator(".monaco-editor").first().waitFor({ timeout: 30_000 })
  await page.locator(".preview-content [data-source-line]").first().waitFor()
}

const cursorLine = async (page: Page) =>
  Number(/Ln (\d+)/.exec((await page.locator(".status-bar").textContent()) ?? "")?.[1])

test("clicking a paragraph with math in the preview puts the editor on its line", async ({ page }) => {
  await open(page)
  await page.locator(".preview-content p", { hasText: "The normalized adjacency matrix" }).click()
  await expect.poll(() => cursorLine(page)).toBe(16)
  await page.locator(".preview-content h1, .preview-content h2", { hasText: "Main results" }).first().click()
  await expect.poll(() => cursorLine(page)).toBe(22)
})

test("moving the editor cursor brings the matching preview block into view", async ({ page }) => {
  await open(page)
  const block = page.locator(".preview-content p", { hasText: "This follows from Lemma" })
  // Ctrl+G is Monaco's go-to-line.
  await page.locator(".monaco-editor .view-line").first().click()
  await page.keyboard.press("Control+g")
  await page.keyboard.type("44")
  await page.keyboard.press("Enter")
  await expect(block).toBeInViewport()
})
