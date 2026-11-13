import { expect, test, type Page } from "@playwright/test"
import { installDeterminism } from "./support/deterministic"
import { installFakeVault } from "./support/fakeVault"

// Git sync from the Sync settings: start a history, connect a shared copy,
// sync by hand, sync automatically, and stop on a conflict. Git is the e2e
// fake; `window.__FAKE_GIT__` records each call's arguments.

type GitMode = "repo" | "not-repo" | "no-remote" | "sync-conflict"

async function openSyncSettings(page: Page, git: GitMode, settings: Record<string, unknown> = {}) {
  await page.setViewportSize({ width: 1280, height: 860 })
  await installDeterminism(page)
  await installFakeVault(page, {
    settings: { theme: "vs-dark", ...settings },
    git,
    files: { "notes.md": "# Notes\n" },
    storage: { comdtex_deps_dismissed: JSON.stringify(["pandoc", "zip"]) },
  })
  await page.goto("/")
  await page.locator(".monaco-editor").first().waitFor({ timeout: 30_000 })
  await page.locator(".titlebar-settings-btn").click()
  await page.locator(".settings-tab", { hasText: "Sync" }).click()
  return page.getByTestId("sync-setup")
}

const gitCalls = (page: Page) =>
  page.evaluate(() => (window as unknown as { __FAKE_GIT__: string[] }).__FAKE_GIT__.slice())

test("a vault without history offers to start one", async ({ page }) => {
  const setup = await openSyncSettings(page, "not-repo")
  await expect(setup).toContainText("This vault keeps no history")
  await setup.getByRole("button", { name: "Start history" }).click()
  await expect(page.getByText("History started.")).toBeVisible()
  // The next step follows on its own: connect a shared copy.
  await expect(setup).toContainText("Create an empty repository")
  const calls = await gitCalls(page)
  expect(calls).toContain("init")
  expect(calls).toContain("commit --allow-empty -m Start keeping history")
})

test("a repository without a shared copy connects to one", async ({ page }) => {
  const setup = await openSyncSettings(page, "no-remote")
  await expect(setup).toContainText("Create an empty repository")
  const connect = setup.getByRole("button", { name: "Connect", exact: true })
  await expect(connect).toBeDisabled()
  await setup.getByRole("textbox").fill("git@github.com:ada/notes.git")
  await connect.click()
  await expect(page.getByText("Vault connected and sent.")).toBeVisible()
  const calls = await gitCalls(page)
  expect(calls).toContain("remote add origin git@github.com:ada/notes.git")
  expect(calls).toContain("push -u origin main")
})

test("Sync now records, brings and sends, and automatic sync shows in the status bar", async ({
  page,
}) => {
  const setup = await openSyncSettings(page, "repo")
  await expect(setup).toContainText("Shared at https://github.com/ada-tester/spectral-vault.git")
  await expect(setup).toContainText("2 changes not yet recorded, 2 to send, 1 to bring")
  await expect(setup).toContainText("Not synced yet in this session.")

  await setup.getByRole("button", { name: "Sync now" }).click()
  await expect(setup).toContainText("Synced: changes brought in and yours sent.")
  await expect(setup).toContainText("Last sync just now.")
  const calls = await gitCalls(page)
  for (const c of [
    "add -A",
    "fetch --quiet origin",
    "merge --no-edit @{u}",
    "push origin HEAD:main",
  ])
    expect(calls).toContain(c)
  expect(calls.some((c) => c.startsWith("commit -m Writing session "))).toBe(true)

  const badge = page.locator(".status-git-sync")
  await expect(badge).toHaveCount(0)
  await expect(setup.getByRole("combobox")).toBeDisabled()
  await setup.getByRole("checkbox").check()
  await expect(setup.getByRole("combobox")).toBeEnabled()
  await expect(badge).toHaveText("Synced")
})

test("a conflict stops sync, aborts the merge and points to the Git panel", async ({ page }) => {
  const setup = await openSyncSettings(page, "sync-conflict", { gitAutoSync: true })
  await setup.getByRole("button", { name: "Sync now" }).click()
  await expect(setup).toContainText("the other copy changed the same lines in 1 file")
  await expect(setup).toContainText("Automatic sync is paused")
  const calls = await gitCalls(page)
  expect(calls).toContain("merge --abort")
  expect(calls.some((c) => c.startsWith("push origin"))).toBe(false)
  await expect(page.locator(".status-git-sync")).toHaveText("Sync stopped")

  await setup.getByRole("button", { name: "Resolve in the Git panel" }).click()
  await expect(page.getByText("origin/main")).toBeVisible()
})
