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

/** Dispatches a keydown at the editor and reports whether anything cancelled it. */
async function keydownCancelled(page: Page, init: KeyboardEventInit) {
  return page.evaluate((i) => {
    const target = document.querySelector(".monaco-editor textarea") ?? document.body
    const ev = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...i })
    target.dispatchEvent(ev)
    return ev.defaultPrevented
  }, init)
}

test("AltGr characters (Ctrl+Alt on Windows) are not swallowed by bookmark or preview shortcuts", async ({
  page,
}) => {
  await openVault(page)
  await page.locator(".monaco-editor textarea").first().focus()
  const altGr = { ctrlKey: true, altKey: true }
  // Spanish: | @ # ~ and the euro sign; German: { [ ]; French: # { [ |.
  for (const [key, code] of [
    ["|", "Digit1"],
    ["@", "Digit2"],
    ["#", "Digit3"],
    ["~", "Digit4"],
    ["¬", "Digit6"],
    ["€", "KeyE"],
    ["{", "Digit7"],
    ["[", "Digit8"],
    ["]", "Digit9"],
    ["{", "Digit4"],
  ]) {
    expect(await keydownCancelled(page, { key, code, ...altGr }), `${key} on ${code}`).toBe(false)
  }
  // An empty bookmark slot is not a shortcut either.
  expect(await keydownCancelled(page, { key: "5", code: "Digit5", ...altGr })).toBe(false)
})

test("Escape and global shortcuts do not leak through the open palette", async ({ page }) => {
  await openVault(page)
  await page.keyboard.press("F11")
  await expect(page.locator(".app.focus-mode")).toHaveCount(1)
  await page.keyboard.press("Control+p")
  await expect(chip(page)).toContainText("Files")
  // F11 and the preview toggle belong to nobody while the palette is open.
  await page.keyboard.press("F11")
  await expect(page.locator(".app.focus-mode")).toHaveCount(1)
  // Ctrl+Shift+P switches the open palette's mode instead of being swallowed.
  await page.keyboard.press("Control+Shift+p")
  await expect(chip(page)).toContainText("Commands")
  await page.keyboard.press("Escape")
  await expect(page.locator(".palette-overlay")).toHaveCount(0)
  // The same Escape must not also have left focus mode.
  await expect(page.locator(".app.focus-mode")).toHaveCount(1)
})

test("Tab stays inside the palette in commands mode", async ({ page }) => {
  await openVault(page)
  await page.keyboard.press("Control+Shift+p")
  await expect(chip(page)).toContainText("Commands")
  // Rows carry pin buttons with tabindex -1; they used to count as the "last"
  // focusable element, so the trap never wrapped and Tab left the dialog.
  await page.locator(".palette-input").fill("find")
  await expect(page.getByRole("option").first()).toBeVisible()
  await page.evaluate(() => {
    const w = window as unknown as { __tabs: boolean[] }
    w.__tabs = []
    window.addEventListener("keydown", (e) => {
      if (e.key === "Tab") w.__tabs.push(e.defaultPrevented)
    })
  })
  for (const combo of ["Tab", "Tab", "Shift+Tab", "Shift+Tab"]) {
    await page.keyboard.press(combo)
    const inside = await page.evaluate(() => !!document.activeElement?.closest(".palette"))
    expect(inside, `after ${combo}`).toBe(true)
  }
  // The trap wrapped every time instead of letting the browser move on.
  expect(await page.evaluate(() => (window as unknown as { __tabs: boolean[] }).__tabs)).toEqual([
    true,
    true,
    true,
    true,
  ])
})

test("a palette action that focuses the editor keeps focus there", async ({ page }) => {
  await openVault(page)
  // Focus starts on a menu button, not the editor: that is what the trap used to restore.
  await page.locator(".menu-btn").first().focus()
  await page.keyboard.press("Control+p")
  await page.locator(".palette-input").fill("@")
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("Enter")
  await expect(page.locator(".palette-overlay")).toHaveCount(0)
  await expect
    .poll(() => page.evaluate(() => !!document.activeElement?.closest(".monaco-editor")))
    .toBe(true)
})

test("a keyboard-activated menu entry that focuses the editor leaves focus in the editor", async ({
  page,
}) => {
  await openVault(page)
  await page.locator(".menu-btn", { hasText: "Edit" }).focus()
  await page.keyboard.press("Enter")
  const entry = page.locator(".menu-entry", { hasText: "Toggle comment" })
  await expect(entry).toBeVisible()
  await entry.focus()
  await page.keyboard.press("Enter")
  await expect(page.locator(".menu-panel")).toHaveCount(0)
  await expect
    .poll(() => page.evaluate(() => !!document.activeElement?.closest(".monaco-editor")))
    .toBe(true)
  expect(await page.evaluate(() => document.activeElement?.classList.contains("menu-btn"))).toBe(
    false,
  )
})

test("Escape closes a menu opened with the mouse", async ({ page }) => {
  await openVault(page)
  await page.locator(".menu-btn", { hasText: "Edit" }).click()
  await expect(page.locator(".menu-panel")).toHaveCount(1)
  await page.keyboard.press("Escape")
  await expect(page.locator(".menu-panel")).toHaveCount(0)
})

test("F1 opens the commands palette even when the editor is not focused", async ({ page }) => {
  await openVault(page)
  await page.locator(".menu-btn").first().focus()
  await page.keyboard.press("F1")
  await expect(chip(page)).toContainText("Commands")
})

test("note#heading reads the live text of an open note", async ({ page }) => {
  await openVault(page)
  await page.getByText("mixing-times.md").first().click()
  await expect(page.getByText("mixing-times.md (ComdTeX)")).toBeVisible()
  await page.locator(".monaco-editor .view-lines").first().click()
  await page.keyboard.press("Control+End")
  await page.keyboard.type("\n\n## Freshly typed heading\n")
  // No pause: the text is still pending in the editor, not yet in any vault cache.
  await page.keyboard.press("Control+p")
  await page.locator(".palette-input").fill("mixing#freshly")
  await expect(page.getByRole("option").first()).toContainText("Freshly typed heading")
})

test("note#heading finds the headings of a note that is not open", async ({ page }) => {
  await openVault(page)
  await page.keyboard.press("Control+p")
  await page.locator(".palette-input").fill("reading-list#read")
  await expect(page.getByRole("option").first()).toContainText("Reading list")
})
