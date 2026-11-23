import { expect, test, type Page } from "@playwright/test"
import { installDeterminism } from "./support/deterministic"
import { installFakeVault } from "./support/fakeVault"

// Open from Git: the dialog from the command palette. The e2e fake has no git
// ("not installed"); the real clone is covered by src/vaultClone.git.test.ts.

async function openDialog(page: Page) {
  await installDeterminism(page)
  await installFakeVault(page, { settings: { theme: "vs-dark", language: "en" } })
  await page.goto("/")
  await page.locator(".monaco-editor").first().waitFor({ timeout: 30_000 })
  await page.keyboard.press("Control+Shift+p")
  await page.locator(".palette-input").fill("open from git")
  await page.keyboard.press("Enter")
  return page.getByTestId("clone-vault")
}

test("the dialog names the folder after the repository and refuses hostile addresses", async ({
  page,
}) => {
  const dialog = await openDialog(page)
  await expect(dialog).toBeVisible()
  const go = dialog.getByRole("button", { name: "Download and open" })
  await expect(go).toBeDisabled()
  const url = dialog.getByLabel("Repository address")
  await url.fill("https://github.com/ada/spectral-notes.git")
  await expect(dialog.getByLabel("Folder name")).toHaveValue("spectral-notes")
  await expect(go).toBeEnabled()
  await url.fill("ext::sh -c id")
  await expect(dialog.getByRole("alert")).toContainText("not allowed")
  await expect(go).toBeDisabled()
  await url.fill("--upload-pack=touch /tmp/x")
  await expect(dialog.getByRole("alert")).toContainText("dash")
  await expect(go).toBeDisabled()
})

test("says plainly when git is not installed and keeps the dialog", async ({ page }) => {
  const dialog = await openDialog(page)
  await dialog.getByLabel("Repository address").fill("https://github.com/ada/notes.git")
  await dialog.getByRole("button", { name: "Download and open" }).click()
  await expect(dialog.getByTestId("clone-error")).toContainText("Git is not installed")
  await expect(dialog.getByRole("button", { name: "Download and open" })).toBeEnabled()
})
