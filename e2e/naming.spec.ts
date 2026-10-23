import { expect, test, type Page } from "@playwright/test"
import { installDeterminism } from "./support/deterministic"
import { installFakeVault } from "./support/fakeVault"

// Creating and naming things: the new-file row sits in the tree, inside the
// folder of the note being edited, and every other create flow says where its
// result will go. Runs against the fake vault (nothing touches the disk).

async function openVault(page: Page) {
  await installDeterminism(page)
  await installFakeVault(page, { settings: { theme: "vs-dark", language: "en" } })
  await page.goto("/")
  await page.locator(".monaco-editor").first().waitFor({ timeout: 30_000 })
  await expect(page.getByRole("treeitem", { name: "spectral-gap.md", exact: true })).toBeVisible()
}

const newFileBtn = (page: Page) => page.getByRole("button", { name: "New file", exact: true })
const input = (page: Page, name = "New file") => page.getByRole("textbox", { name })

test("the new-file button opens an inline row inside the active note's folder", async ({
  page,
}) => {
  await openVault(page)
  await newFileBtn(page).click()
  const field = input(page)
  await expect(field).toBeFocused()
  // Inside papers/, not at the top of the sidebar.
  await expect(
    page.getByRole("treeitem", { name: /Folder: papers/ }).getByRole("textbox"),
  ).toBeVisible()
  await expect(page.locator(".tree-new-input")).toHaveCount(0)

  await field.fill("draft")
  await page.keyboard.press("Enter")

  // Created in papers/, opened in a tab, selected in the tree, cursor in the editor.
  await expect(page.locator(".tab-bar, [role=tablist]").first()).toContainText("draft.md")
  const row = page.getByRole("treeitem", { name: "draft.md", exact: true })
  await expect(row).toHaveClass(/tree-active/)
  await expect(row).toHaveClass(/tree-focused/)
  await expect(page.locator("[data-path$='/papers/draft.md']")).toHaveCount(1)
  await expect(page.locator(".monaco-editor.focused").first()).toBeVisible()
})

test("Escape cancels and nothing is created", async ({ page }) => {
  await openVault(page)
  await newFileBtn(page).click()
  await input(page).fill("nope")
  await page.keyboard.press("Escape")
  await expect(input(page)).toHaveCount(0)
  await expect(page.locator("[data-path$='/papers/nope.md']")).toHaveCount(0)
})

test("invalid names show a message and block Enter", async ({ page }) => {
  await openVault(page)
  await newFileBtn(page).click()
  const field = input(page)
  await field.fill("a/b")
  await expect(page.locator(".tree-name-error")).toContainText("not allowed")
  await page.keyboard.press("Enter")
  await expect(field).toBeVisible()
  await field.fill("spectral-gap")
  await expect(page.locator(".tree-name-error")).toContainText("already exists in this folder")
  await field.fill("SPECTRAL-GAP")
  await expect(page.locator(".tree-name-error")).toContainText("already exists here")
  await field.fill("con")
  await expect(page.locator(".tree-name-error")).toContainText("Reserved")
  await field.fill("fine")
  await expect(page.locator(".tree-name-error")).toHaveCount(0)
})

test("a selected folder wins over the active note's folder; .tex is kept", async ({ page }) => {
  await openVault(page)
  await page.getByLabel("Folder: notes").click()
  await newFileBtn(page).click()
  await input(page).fill("sketch.tex")
  await page.keyboard.press("Enter")
  await expect(page.locator("[data-path$='/notes/sketch.tex']")).toHaveCount(1)
})

test("the folder button creates a folder inline and selects it", async ({ page }) => {
  await openVault(page)
  await page.getByRole("button", { name: "New folder", exact: true }).click()
  await input(page, "New folder").fill("drafts")
  await page.keyboard.press("Enter")
  const row = page.getByLabel("Folder: drafts")
  await expect(row).toBeVisible()
  await expect(row).toHaveClass(/tree-focused/)
})

test("rename is inline in the row, selects the base name and Escape restores it", async ({
  page,
}) => {
  await openVault(page)
  await page.getByRole("treeitem", { name: "typesetting.md", exact: true }).dblclick()
  const field = input(page, "Rename typesetting.md")
  await expect(field).toBeFocused()
  const sel = await field.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])
  expect(sel).toEqual([0, "typesetting".length])
  await field.fill("spectral-gap.md")
  await expect(page.locator(".tree-name-error")).toContainText("already exists")
  await page.keyboard.press("Escape")
  await expect(page.getByRole("treeitem", { name: "typesetting.md", exact: true })).toBeVisible()
})

test("the palette's Create row shows the full destination and follows the same rule", async ({
  page,
}) => {
  await openVault(page)
  await page.keyboard.press("Control+p")
  await page.locator(".palette-input").fill("brand new idea")
  await expect(page.getByRole("option").last()).toHaveText(/Create papers\/brand new idea\.md/)
  await page.keyboard.press("Shift+Enter")
  await expect(page.locator("[data-path$='/papers/brand new idea.md']")).toHaveCount(1)
  await expect(page.locator(".tab-bar, [role=tablist]").first()).toContainText("brand new idea.md")
})

test("the New file command in the palette opens the same inline row", async ({ page }) => {
  await openVault(page)
  await page.keyboard.press("Control+Shift+p")
  await page.locator(".palette-input").fill("new file")
  await page.keyboard.press("Enter")
  await expect(input(page)).toBeFocused()
})

test("the template picker asks for the folder, defaulting to the active note's", async ({
  page,
}) => {
  await openVault(page)
  await page.keyboard.press("Control+Shift+p")
  await page.locator(".palette-input").fill("new from template")
  await page.keyboard.press("Enter")
  await expect(page.locator("#template-folder")).toHaveValue(/papers$/)
  await page.getByLabel("File name").fill("from-template")
  await expect(page.getByText("Creates papers/from-template.md")).toBeVisible()
  await page.getByRole("button", { name: "Create", exact: true }).click()
  await expect(page.locator("[data-path$='/papers/from-template.md']")).toHaveCount(1)
})
