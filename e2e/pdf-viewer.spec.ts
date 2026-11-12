import { expect, test, type Page } from "@playwright/test"
import { installDeterminism } from "./support/deterministic"
import { installFakeVault } from "./support/fakeVault"
import { tinyPdf } from "./support/tinyPdf"

// The PDF viewer: one page painted at a time with far pages freed (it used to
// keep every page and render them all at once), its own zoom on Ctrl+wheel,
// pinch and Ctrl +/- (those zoomed the editor font before), and the tools:
// page box, zoom menu, fit page, selectable text, Ctrl+F search.

const PAGES = 40

async function openPdf(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await installDeterminism(page)
  await installFakeVault(page, {
    settings: { theme: "vs-dark" },
    files: { "long.pdf": tinyPdf(PAGES) },
    storage: { comdtex_deps_dismissed: JSON.stringify(["pandoc", "zip"]) },
  })
  await page.goto("/")
  await page.locator(".monaco-editor").first().waitFor({ timeout: 30_000 })
  await page.locator(".sidebar").getByText("long.pdf").click()
  await expect(page.locator(".pdf-page")).toHaveCount(PAGES)
  await expect.poll(async () => (await painted(page)).includes(1)).toBe(true)
  return page.locator(".pdf-pages").last()
}

const painted = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLCanvasElement>(".pdf-page canvas")]
      .filter((c) => c.width > 0)
      .map((c) => Number(c.dataset.page)),
  )

const sheetWidth = async (page: Page) =>
  (await page.locator(".pdf-page").first().boundingBox())!.width

const editorFontSize = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("comdtex_settings") ?? "{}").fontSize ?? null)

test("scrolling a long PDF keeps only the pages around the view painted", async ({ page }) => {
  const pane = await openPdf(page)
  await pane.evaluate((el) => (el.scrollTop = el.scrollHeight))
  await expect.poll(async () => (await painted(page)).includes(PAGES)).toBe(true)
  const live = await painted(page)
  expect(live).not.toContain(1)
  expect(live.length).toBeLessThanOrEqual(8)
})

test("zooming in enlarges the page and keeps its left edge reachable", async ({ page }) => {
  const pane = await openPdf(page)
  const before = await sheetWidth(page)
  await page.getByRole("button", { name: "Zoom in" }).click()
  await expect.poll(() => sheetWidth(page)).toBeGreaterThan(before)
  await pane.evaluate((el) => (el.scrollLeft = 0))
  const paneBox = (await pane.boundingBox())!
  expect((await page.locator(".pdf-page").first().boundingBox())!.x).toBeGreaterThanOrEqual(
    paneBox.x - 1,
  )
})

test("Ctrl+wheel and Ctrl +/- zoom the PDF, not the editor font", async ({ page }) => {
  const pane = await openPdf(page)
  const font = await editorFontSize(page)
  const start = await sheetWidth(page)
  const box = (await pane.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.keyboard.down("Control")
  await page.mouse.wheel(0, -300)
  await page.keyboard.up("Control")
  await expect.poll(() => sheetWidth(page)).toBeGreaterThan(start)
  const afterWheel = await sheetWidth(page)
  await page.keyboard.press("Control+Minus")
  await expect.poll(() => sheetWidth(page)).toBeLessThan(afterWheel)
  await page.keyboard.press("Control+0")
  await expect(page.getByRole("combobox", { name: "Zoom" })).toHaveValue("width")
  expect(await editorFontSize(page)).toBe(font)
})

test("the page box jumps to a page", async ({ page }) => {
  await openPdf(page)
  const box = page.getByRole("textbox", { name: "Go to page" })
  await box.fill("25")
  await box.press("Enter")
  await expect(page.locator('.pdf-page[data-page="25"]')).toBeInViewport()
  await expect(box).toHaveValue("25")
})

test("the text is selectable and Ctrl+F finds and highlights it", async ({ page }) => {
  await openPdf(page)
  await expect(page.locator('.pdf-page[data-page="1"] .pdf-text-layer span').first()).toBeAttached()
  await page.locator(".pdf-pages").last().focus()
  await page.keyboard.press("Control+f")
  const input = page.getByRole("searchbox", { name: "Find in PDF" })
  await expect(input).toBeFocused()
  await input.fill("Page 30")
  await expect(page.locator(".pdf-find-count")).toHaveText("1 of 1")
  await expect(page.locator(".pdf-hit-active")).toBeInViewport()
  await expect(page.locator(".pdf-hit-active")).toHaveText("Page 30")
  await input.fill("Cheeger")
  await expect(page.locator(".pdf-find-count")).toHaveText(`1 of ${PAGES}`)
  await input.press("Enter")
  await expect(page.locator(".pdf-find-count")).toHaveText(`2 of ${PAGES}`)
  await expect(page.locator('.pdf-page[data-page="2"] .pdf-hit-active')).toBeInViewport()
  await input.press("Escape")
  await expect(page.locator(".pdf-hit")).toHaveCount(0)
})
