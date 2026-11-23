import { expect, test, type Page } from "@playwright/test"
import { installDeterminism } from "./support/deterministic"
import { installFakeVault } from "./support/fakeVault"

// Tracked changes (CriticMarkup): insert, accept and reject from the command
// palette, the editor decorations and the preview.

async function openEmpty(page: Page) {
  await installDeterminism(page)
  await installFakeVault(page, {
    settings: { theme: "vs-dark", language: "en" },
    tabs: ["papers/spectral-gap.md"],
    storage: { comdtex_deps_dismissed: JSON.stringify(["pandoc", "zip"]) },
  })
  await page.goto("/")
  await page.locator(".monaco-editor").first().waitFor({ timeout: 30_000 })
  await page.locator(".monaco-editor .view-lines").first().click()
  await page.keyboard.press("Control+a")
  await page.keyboard.press("Delete")
}

async function text(page: Page) {
  const raw = await page.locator(".monaco-editor .view-lines").first().innerText()
  return raw.replace(/\u00a0/g, " ").replace(/\n+$/, "")
}

async function command(page: Page, query: string) {
  await page.keyboard.press("Control+Shift+p")
  await page.locator(".palette-input").fill(query)
  await page.getByRole("option").first().click()
  await expect(page.locator(".palette-overlay")).toHaveCount(0)
}

test("mark a selection as an addition, then accept it", async ({ page }) => {
  await openEmpty(page)
  await page.keyboard.type("one two three")
  await page.keyboard.press("Home")
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight")
  await page.keyboard.press("Control+Shift+ArrowRight")
  await command(page, "mark as addition")
  await expect.poll(() => text(page)).toBe("one {++two++} three")
  await expect(page.locator(".critic-ed-add").first()).toBeVisible()
  await command(page, "accept change at cursor")
  await expect.poll(() => text(page)).toBe("one two three")
  await expect(page.locator(".critic-ed-add")).toHaveCount(0)
})

test("reject a deletion and accept all", async ({ page }) => {
  await openEmpty(page)
  await page.keyboard.insertText("a {--b--} c {++d++} $x^{2}$ {>>n<<}")
  await expect(page.locator(".critic-ed-del").first()).toBeVisible()
  // Put the caret inside the deletion and reject it.
  await page.keyboard.press("Home")
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight")
  await command(page, "reject change at cursor")
  await expect.poll(() => text(page)).toBe("a b c {++d++} $x^{2}$ {>>n<<}")
  await command(page, "accept all")
  await expect.poll(() => text(page)).toBe("a b c d $x^{2}$ ")
})

test("the preview shows marks and still renders math inside them", async ({ page }) => {
  await openEmpty(page)
  await page.keyboard.insertText("We {++prove $x^2$++} and {--drop--}.{>>check<<}")
  const preview = page.locator(".preview-content")
  await expect(preview.locator("ins.critic-add")).toBeVisible()
  await expect(preview.locator("ins.critic-add .katex")).toBeVisible()
  await expect(preview.locator("del.critic-del")).toHaveText(/drop/)
  const note = preview.locator(".critic-comment")
  await expect(note).toHaveAttribute("data-comment", "check")
  await note.focus()
  await expect(note).toBeFocused()
})

test("a mark inside a formula is left alone", async ({ page }) => {
  await openEmpty(page)
  await page.keyboard.insertText("$a {++b++} c$")
  await page.waitForTimeout(400)
  await expect(page.locator(".critic-ed-add")).toHaveCount(0)
  await expect(page.locator(".preview-content ins.critic-add")).toHaveCount(0)
})
