import { expect, test, type Page } from "@playwright/test"
import { installDeterminism } from "./support/deterministic"
import { installFakeVault } from "./support/fakeVault"

// Editor autocomplete, driven the way a person drives it: type the trigger,
// pick a suggestion, read what landed in the document. The fake vault has
// `papers/spectral-gap.md` (open, with {#thm:mixing}), `papers/typesetting.md`
// (with {#thm:main}), `notes/mixing-times.md` and a references.bib.

async function openEditor(page: Page, files?: Record<string, string>) {
  await installDeterminism(page)
  await installFakeVault(page, { settings: { theme: "vs-dark" }, files })
  await page.goto("/")
  await page.locator(".monaco-editor").first().waitFor({ timeout: 30_000 })
  await page.locator(".monaco-editor .view-lines").first().click()
  await page.keyboard.press("Control+End")
  await page.keyboard.press("Enter")
  await page.keyboard.press("Enter")
}

const widget = (page: Page) => page.locator(".suggest-widget.visible")
const doc = (page: Page) => page.locator(".monaco-editor .view-lines").first()

test("[[ opens the note list at once and inserts a single closer", async ({ page }) => {
  await openEditor(page)
  await page.keyboard.type("See [[")
  await expect(widget(page)).toBeVisible()
  await page.keyboard.type("mixing")
  await expect(widget(page)).toContainText("mixing-times")
  await page.keyboard.press("Enter")
  await expect(doc(page)).toContainText("See [[mixing-times]]")
  await expect(doc(page)).not.toContainText("]]]")
})

test("[@ opens the citation list at once and inserts a single closer", async ({ page }) => {
  await openEditor(page)
  await page.keyboard.type("Cf. [@")
  await expect(widget(page)).toBeVisible()
  await page.keyboard.type("lubotzky")
  await expect(widget(page)).toContainText("lubotzky1988")
  await page.keyboard.press("Enter")
  await expect(doc(page)).toContainText("Cf. [@lubotzky1988]")
  await expect(doc(page)).not.toContainText("lubotzky1988]]")
})

test("a citation is found by author, and the next key after '; ' is offered", async ({ page }) => {
  await openEditor(page)
  await page.keyboard.type("As in [@")
  await page.keyboard.type("lubotzky")
  await page.keyboard.press("Enter")
  await page.keyboard.type("; ")
  await expect(widget(page)).toBeVisible()
  await page.keyboard.type("@levin")
  await expect(widget(page)).toContainText("levin2017")
  await page.keyboard.press("Enter")
  await expect(doc(page)).toContainText("As in [@lubotzky1988; @levin2017]")
})

test("@thm: lists this file's labels first and inserts the bare reference", async ({ page }) => {
  await openEditor(page)
  await page.keyboard.type("By @thm:")
  await expect(widget(page)).toBeVisible()
  const rows = widget(page).locator(".monaco-list-row")
  await expect(rows.first()).toContainText("mixing")
  await page.keyboard.type("mix")
  await page.keyboard.press("Enter")
  await expect(doc(page)).toContainText("By @thm:mixing")
  await expect(doc(page)).not.toContainText("@thm:mixing@")
})

test("@thm: from another file inserts the cross-file form", async ({ page }) => {
  await openEditor(page)
  await page.keyboard.type("Also @thm:")
  await expect(widget(page)).toBeVisible()
  await page.keyboard.type("main")
  await expect(widget(page)).toContainText("main")
  await page.keyboard.press("Enter")
  await expect(doc(page)).toContainText("Also @papers/typesetting@thm:main")
})

test("the inner @def: of a cross-file reference does not open a second, local list", async ({
  page,
}) => {
  await openEditor(page)
  await page.keyboard.type("See @papers/typesetting@thm:")
  await expect(widget(page)).toBeVisible()
  // Only the labels of that note: the local thm:mixing must not be offered.
  await expect(widget(page)).toContainText("main")
  await expect(widget(page)).not.toContainText("mixing")
  await page.keyboard.press("Enter")
  await expect(doc(page)).toContainText("See @papers/typesetting@thm:main")
  await expect(doc(page)).not.toContainText("@thm:main@")
})

test("Enter on a ::: opening line writes the closing fence", async ({ page }) => {
  await openEditor(page)
  await page.keyboard.type(":::remark")
  await page.keyboard.press("Escape")
  await page.keyboard.press("Enter")
  await page.keyboard.type("Body.")
  await expect(doc(page)).toContainText(":::remark")
  await expect(doc(page)).toContainText("Body.")
  const text = await doc(page).innerText()
  expect(text.replace(/ /g, " ")).toMatch(/:::remark\s*\n\s*Body\.\s*\n\s*:::\s*$/)
})

test(":::csv completes the vault CSV and then its column headers", async ({ page }) => {
  await openEditor(page, { "data/growth.csv": "year,Population Size,rate\n2000,1,2\n" })
  await page.keyboard.type(":::csv")
  await page.keyboard.press("Escape")
  await page.keyboard.press("Enter")
  await page.keyboard.type("growth")
  await expect(widget(page)).toContainText("growth.csv")
  await page.keyboard.press("Enter")
  await page.keyboard.type(" (")
  await expect(widget(page)).toBeVisible()
  await expect(widget(page)).toContainText("Population Size")
  await page.keyboard.type("Pop")
  await page.keyboard.press("Enter")
  await expect(doc(page)).toContainText("growth.csv (Population Size")
})

test("@eq: draws the equation in the details pane once the pane is open", async ({ page }) => {
  await openEditor(page)
  await page.keyboard.type("Eq @eq:")
  await expect(widget(page)).toBeVisible()
  // Ctrl+Space toggles the details pane; the first label is focused.
  await page.keyboard.press("Control+Space")
  await expect(page.locator(".suggest-details .comdtex-suggest-math .katex").first()).toBeVisible()
})

test("typing a shorthand call shows its signature and the current argument", async ({ page }) => {
  await openEditor(page)
  await page.keyboard.type("Then frac(a, ")
  const hints = page.locator(".parameter-hints-widget")
  await expect(hints).toContainText("frac(num, den)")
  await expect(hints.locator(".parameter.active")).toHaveText("den")
})

test("frontmatter: a texclass value is completed from the exporter's classes", async ({ page }) => {
  await installDeterminism(page)
  await installFakeVault(page, { settings: { theme: "vs-dark" } })
  await page.goto("/")
  await page.locator(".monaco-editor").first().waitFor({ timeout: 30_000 })
  await page.locator(".monaco-editor .view-lines").first().click()
  await page.keyboard.press("Control+Home")
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("End")
  await page.keyboard.press("Enter")
  await page.keyboard.type("comdtex.texclass: ")
  await expect(widget(page)).toContainText("ieeetran")
  await page.keyboard.type("acm")
  await page.keyboard.press("Enter")
  await expect(doc(page)).toContainText("comdtex.texclass: acmart")
})
