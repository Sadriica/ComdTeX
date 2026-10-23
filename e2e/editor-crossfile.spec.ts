import { expect, test, type Page } from "@playwright/test"
import { boxOf, cursorLine } from "./support/editorNav"
import { installDeterminism } from "./support/deterministic"
import { installFakeVault } from "./support/fakeVault"

// A note whose path is outside A-Za-z0-9_./- (an accent): the reference that
// completion writes has to be one the preview, the linter and F12 all read.

async function openEmpty(page: Page) {
  await installDeterminism(page)
  await installFakeVault(page, {
    settings: { theme: "vs-dark" },
    tabs: ["papers/spectral-gap.md"],
    storage: { comdtex_deps_dismissed: JSON.stringify(["pandoc", "zip"]) },
    files: { "Álgebra/Teoría.md": ":::proposition[Grupos]{#prop:grupos}\nTodo grupo.\n:::\n" },
  })
  await page.goto("/")
  await page.locator(".monaco-editor").first().waitFor({ timeout: 30_000 })
  await page.locator(".monaco-editor .view-lines").first().click()
  await page.keyboard.press("Control+a")
  await page.keyboard.press("Delete")
}

test("a cross-file reference to an accented path resolves, lints clean and jumps", async ({
  page,
}) => {
  await openEmpty(page)
  await page.keyboard.type("Ver @prop:")
  const widget = page.locator(".suggest-widget.visible")
  await expect(widget).toBeVisible()
  await page.keyboard.type("grup")
  await expect(widget).toContainText("grupos")
  await page.keyboard.press("Enter")
  const lines = page.locator(".monaco-editor .view-lines").first()
  await expect(lines).toContainText("Ver @[Álgebra/Teoría]@prop:grupos")

  // The preview resolves it.
  await expect(page.locator(".preview-content .env-ref-cross").first()).toBeVisible()
  await expect(page.locator(".preview-content .env-ref-broken")).toHaveCount(0)

  // The linter has nothing to say about it.
  await page.waitForTimeout(1800)
  await expect(page.locator(".monaco-editor .squiggly-warning")).toHaveCount(0)
  await expect(page.locator(".monaco-editor .squiggly-error")).toHaveCount(0)

  // F12 lands on the definition in that note.
  const box = await boxOf(page, "@[Álgebra/Teoría]@prop:grupos")
  await page.mouse.click(box.x + box.w - 10, box.y + box.h / 2)
  await page.keyboard.press("F12")
  await expect(page.locator(".tab-active .tab-name")).toContainText("Teoría.md")
  await expect.poll(() => cursorLine(page)).toBe(1)
})
