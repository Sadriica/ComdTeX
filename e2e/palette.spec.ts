import { expect, test, type Page } from "@playwright/test"
import { installDeterminism } from "./support/deterministic"
import { installFakeVault } from "./support/fakeVault"

async function openVault(page: Page) {
  await installDeterminism(page)
  await installFakeVault(page, { settings: { theme: "vs-dark", language: "en" } })
  await page.goto("/")
  await page.locator(".monaco-editor").first().waitFor({ timeout: 30_000 })
}

const chip = (page: Page) => page.getByTestId("palette-mode")
const rows = (page: Page) => page.getByRole("option")

test("Ctrl+P opens files mode with the folder column and opens a note", async ({ page }) => {
  await openVault(page)
  await page.keyboard.press("Control+p")
  await expect(chip(page)).toContainText("Files")
  await page.locator(".palette-input").fill("expander")
  const row = rows(page).first()
  await expect(row).toContainText("expander-notes.md")
  await expect(row.locator(".palette-desc")).toHaveText("notes")
  await page.keyboard.press("Enter")
  await expect(page.locator(".palette-overlay")).toHaveCount(0)
  await expect(page.getByText("expander-notes.md (ComdTeX)")).toBeVisible()
})

test("Ctrl+Shift+P opens commands mode", async ({ page }) => {
  await openVault(page)
  await page.keyboard.press("Control+Shift+p")
  await expect(chip(page)).toContainText("Commands")
  await page.locator(".palette-input").fill("fill gap")
  await expect(rows(page).first()).toContainText("Fill gap with AI")
})

test("@ lists the headings of the current document and jumps", async ({ page }) => {
  await openVault(page)
  await page.keyboard.press("Control+p")
  await page.locator(".palette-input").fill("@")
  await expect(chip(page)).toContainText("This document")
  expect(await rows(page).count()).toBeGreaterThan(1)
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("Enter")
  await expect(page.locator(".palette-overlay")).toHaveCount(0)
})

test("[ searches references.bib and inserts a citation", async ({ page }) => {
  await openVault(page)
  await page.locator(".monaco-editor textarea").first().focus()
  await page.keyboard.press("Control+End")
  await page.keyboard.press("Control+p")
  await page.locator(".palette-input").fill("[")
  await expect(chip(page)).toContainText("Citations")
  await page.locator(".palette-input").fill("sarnak")
  await expect(rows(page).first()).toContainText("Lubotzky")
  await page.keyboard.press("Enter")
  await expect(page.locator(".monaco-editor .view-lines").first()).toContainText("[@lubotzky1988]")
})

test("the palette is a combobox with a live result count", async ({ page }) => {
  await openVault(page)
  await page.keyboard.press("Control+Shift+p")
  const input = page.getByRole("combobox")
  await input.fill("insert")
  await expect(page.locator(".palette-sr")).toHaveText(/results?/)
  const active = await input.getAttribute("aria-activedescendant")
  expect(active).toBeTruthy()
  await expect(page.locator(`[id="${active}"]`)).toHaveAttribute("aria-selected", "true")
})
