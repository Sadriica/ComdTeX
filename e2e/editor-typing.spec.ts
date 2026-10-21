import { expect, test, type Page } from "@playwright/test"
import { installDeterminism } from "./support/deterministic"
import { installFakeVault } from "./support/fakeVault"

// What typing leaves in the document: auto-closed pairs must never leave a
// stray character behind, and the suggest widget must never accept something
// nobody chose.

async function openEmpty(page: Page) {
  await installDeterminism(page)
  await installFakeVault(page, {
    settings: { theme: "vs-dark" },
    tabs: ["papers/spectral-gap.md"],
    storage: { comdtex_deps_dismissed: JSON.stringify(["pandoc", "zip"]) },
  })
  await page.goto("/")
  await page.locator(".monaco-editor").first().waitFor({ timeout: 30_000 })
  await page.locator(".monaco-editor .view-lines").first().click()
  await page.keyboard.press("Control+a")
  await page.keyboard.press("Delete")
}

const widget = (page: Page) => page.locator(".suggest-widget.visible")

/** The document text as typed (non-breaking spaces folded back). */
async function text(page: Page) {
  const raw = await page.locator(".monaco-editor .view-lines").first().innerText()
  return raw.replace(/ /g, " ").replace(/\n+$/, "")
}

test("typing a code fence leaves exactly the typed backticks", async ({ page }) => {
  await openEmpty(page)
  await page.keyboard.type("```")
  await page.waitForTimeout(150)
  expect(await text(page)).toBe("```")
})

test("a fenced block typed with Enter closes exactly as typed", async ({ page }) => {
  await openEmpty(page)
  await page.keyboard.type("```python")
  await page.keyboard.press("Enter")
  await page.keyboard.type("print(1)")
  await page.keyboard.press("Enter")
  await page.keyboard.type("```")
  await page.waitForTimeout(150)
  expect(await text(page)).toBe("```python\nprint(1)\n```")
})

test("inline code still closes its backtick", async ({ page }) => {
  await openEmpty(page)
  await page.keyboard.type("a `x")
  await expect.poll(() => text(page)).toBe("a `x`")
})

test("a price does not leave a stray dollar", async ({ page }) => {
  await openEmpty(page)
  await page.keyboard.type("costs $5 each")
  await page.waitForTimeout(150)
  expect(await text(page)).toBe("costs $5 each")
})

test("inline math still closes its dollar and types over it", async ({ page }) => {
  await openEmpty(page)
  await page.keyboard.type("so $x")
  await expect.poll(() => text(page)).toBe("so $x$")
  await page.keyboard.type("$ ok")
  await expect.poll(() => text(page)).toBe("so $x$ ok")
})

test("a dollar inside fenced code is just a dollar", async ({ page }) => {
  await openEmpty(page)
  await page.keyboard.type("```sh")
  await page.keyboard.press("Enter")
  await page.keyboard.type("echo $HOME")
  await page.waitForTimeout(150)
  expect(await text(page)).toBe("```sh\necho $HOME")
})

test("a dollar inside inline code is just a dollar", async ({ page }) => {
  await openEmpty(page)
  await page.keyboard.type("run `echo $HOME")
  await page.waitForTimeout(150)
  expect(await text(page)).toBe("run `echo $HOME`")
})

test("Enter after a price and a word does not accept a shorthand", async ({ page }) => {
  await openEmpty(page)
  await page.keyboard.type("costs $5 and sum")
  await page.waitForTimeout(300)
  await page.keyboard.press("Enter")
  await page.keyboard.type("next")
  await page.waitForTimeout(150)
  expect(await text(page)).toBe("costs $5 and sum\nnext")
})

test("Enter in math does not accept a suggestion that opened by itself", async ({ page }) => {
  await openEmpty(page)
  await page.keyboard.type("so $sum")
  await expect(widget(page)).toBeVisible()
  await page.keyboard.press("Enter")
  await page.keyboard.type("next")
  await page.waitForTimeout(150)
  expect(await text(page)).toBe("so $sum\nnext$")
})

test("a suggestion in math is accepted once the user navigated to it", async ({ page }) => {
  await openEmpty(page)
  await page.keyboard.type("so $sum")
  await expect(widget(page)).toBeVisible()
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("ArrowUp")
  await page.keyboard.press("Enter")
  await page.waitForTimeout(150)
  // Accepted in place: no new line was started.
  expect(await text(page)).not.toContain("\n")
  expect(await text(page)).toContain("sum")
})

test("accepting a label keeps the punctuation after the caret", async ({ page }) => {
  await openEmpty(page)
  await page.keyboard.type("see @thm:.")
  await page.keyboard.press("ArrowLeft")
  await page.keyboard.press("Control+Space")
  await expect(widget(page)).toBeVisible()
  await page.keyboard.press("Enter")
  await page.waitForTimeout(150)
  expect(await text(page)).toMatch(/^see @\S+@thm:\w+\.$/)
})

test("accepting a label keeps a hyphenated word after the caret", async ({ page }) => {
  await openEmpty(page)
  await page.keyboard.type("a @thm:-style")
  for (let i = 0; i < "-style".length; i++) await page.keyboard.press("ArrowLeft")
  await page.keyboard.press("Control+Space")
  await expect(widget(page)).toBeVisible()
  await page.keyboard.press("Enter")
  await page.waitForTimeout(150)
  expect(await text(page)).toMatch(/^a @\S+@thm:\w+-style$/)
})

test("a thematic break above prose is not a header: Enter never accepts a key", async ({
  page,
}) => {
  await openEmpty(page)
  await page.keyboard.type("---")
  await page.keyboard.press("Enter")
  await page.keyboard.type("A first paragraph.")
  await page.keyboard.press("Enter")
  await page.keyboard.type("ti")
  await page.waitForTimeout(400)
  await expect(widget(page)).toBeHidden()
  await page.keyboard.press("Enter")
  await page.keyboard.type("x")
  await expect.poll(() => text(page)).toBe("---\nA first paragraph.\nti\nx")
})

test("Enter on a ::: line inside a code fence does not write a closer", async ({ page }) => {
  await openEmpty(page)
  await page.keyboard.type("```md")
  await page.keyboard.press("Enter")
  await page.keyboard.type(":::remark")
  await page.keyboard.press("Escape")
  await page.keyboard.press("Enter")
  await page.keyboard.type("x")
  await expect.poll(() => text(page)).toBe("```md\n:::remark\nx")
})
