import { expect, test } from "@playwright/test"
import { installDeterminism } from "./support/deterministic"
import { installFakeVault } from "./support/fakeVault"

// The Sync panel with no conflict copies, for a vault that is a git
// repository with a remote and sits in no cloud folder. The panel and the Sync
// settings must describe it the same way (the settings used to miss the vault's
// git state and claim nothing left the disk).

test("an empty Sync panel says why and agrees with the Sync settings", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 })
  await installDeterminism(page)
  await installFakeVault(page, {
    settings: { theme: "vs-dark" },
    git: "repo",
    files: { "notes.md": "# Notes\n" },
    storage: { comdtex_deps_dismissed: JSON.stringify(["pandoc", "zip"]) },
  })
  await page.goto("/")
  await page.locator(".monaco-editor").first().waitFor({ timeout: 30_000 })
  await page.getByRole("button", { name: "Sync", exact: true }).first().click()

  const panel = page.locator(".cloud-sync-panel")
  await expect(panel).toContainText("This vault is not inside a cloud folder")
  await expect(panel).toContainText("Versioned and shared.")

  await panel.getByRole("button", { name: "Sync settings" }).click()
  const modal = page
    .locator(".settings-modal, [role=dialog]")
    .filter({ hasText: "How this vault travels" })
  await expect(modal).toContainText("Versioned and shared.")
  await expect(modal).not.toContainText("Nothing leaves this disk.")
  await page.keyboard.press("Escape")

  await panel.getByRole("button", { name: "Open the Git panel" }).click()
  await expect(page.getByText("origin/main")).toBeVisible()
})
