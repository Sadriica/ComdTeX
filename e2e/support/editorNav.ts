import { expect, type Page } from "@playwright/test"
import { installDeterminism } from "./deterministic"
import { installFakeVault } from "./fakeVault"

// Helpers shared by the editor navigation e2e spec and its visual shots.

const noise = ["Failed to load resource", "[vite]", "React DevTools"]

/** Open the fake vault on spectral-gap.md; returns the live list of console/page errors. */
export async function openVault(page: Page, theme = "vs-dark") {
  const errors: string[] = []
  page.on("console", (m) => {
    if (m.type() === "error" && !noise.some((n) => m.text().includes(n))) errors.push(m.text())
  })
  page.on("pageerror", (e) => errors.push(e.message))
  await page.setViewportSize({ width: 1440, height: 900 })
  await installDeterminism(page)
  await installFakeVault(page, {
    settings: { theme },
    storage: { comdtex_deps_dismissed: JSON.stringify(["pandoc", "zip"]) },
  })
  await page.goto("/")
  await page.locator(".monaco-editor").first().waitFor({ timeout: 30_000 })
  await expect(page.locator(".tab-name", { hasText: "spectral-gap.md" })).toBeVisible()
  return errors
}

/** Scroll the editor so `line` is on screen (Ctrl+G). */
export async function revealLine(page: Page, line: number) {
  await page
    .locator(".monaco-editor .view-lines")
    .first()
    .click({ position: { x: 5, y: 5 } })
  await page.keyboard.press("Control+g")
  await page.keyboard.type(String(line))
  await page.keyboard.press("Enter")
  await page.waitForTimeout(250)
}

/** The on-screen box of `needle` inside the visible editor lines. */
export async function boxOf(page: Page, needle: string) {
  const box = await page.evaluate((text) => {
    const rows = Array.from(document.querySelectorAll(".monaco-editor .view-line"))
    for (const row of rows) {
      const content = row.textContent ?? ""
      const at = content.replace(/ /g, " ").indexOf(text)
      if (at < 0) continue
      const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT)
      let offset = 0
      let node: Node | null
      while ((node = walker.nextNode())) {
        const len = node.textContent?.length ?? 0
        if (at < offset + len) {
          const range = document.createRange()
          const local = at - offset
          range.setStart(node, local)
          range.setEnd(node, Math.min(len, local + text.length))
          const r = range.getBoundingClientRect()
          return { x: r.x, y: r.y, w: r.width, h: r.height }
        }
        offset += len
      }
    }
    return null
  }, needle)
  expect(box, `"${needle}" is on screen`).not.toBeNull()
  return box!
}

/** Line number shown in the status bar ("Ln 28, Col 3"). */
export async function cursorLine(page: Page): Promise<number> {
  const text = (await page.locator(".status-bar").first().textContent()) ?? ""
  const m = /(?:Ln|Lín)\s*(\d+)/i.exec(text)
  return m ? Number(m[1]) : -1
}
