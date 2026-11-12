import { expect, test, type Page } from "@playwright/test"
import { installDeterminism } from "./support/deterministic"
import { installFakeVault } from "./support/fakeVault"
import { tinyPdf } from "./support/tinyPdf"

// The PDF viewer, on pdf.js's own viewer: virtualised pages, its own zoom on
// Ctrl+wheel, pinch and Ctrl +/- (those zoomed the editor font before), the
// toolbar (page box, zoom menu, search) and the annotation tools, whose work
// is written into the PDF.

const PAGES = 40

async function openPdf(page: Page, { webkit250 = false } = {}) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await installDeterminism(page)
  if (webkit250) {
    // The WebKitGTK the Linux AppImage ships (2.50) cannot iterate a
    // ReadableStream with for await; pdf.js's getTextContent does exactly that.
    await page.addInitScript(() => {
      const proto = ReadableStream.prototype as unknown as Record<PropertyKey, unknown>
      delete proto[Symbol.asyncIterator]
      delete proto.values
    })
  }
  await installFakeVault(page, {
    settings: { theme: "vs-dark" },
    files: { "long.pdf": tinyPdf(PAGES) },
    storage: { comdtex_deps_dismissed: JSON.stringify(["pandoc", "zip"]) },
  })
  await page.goto("/")
  await page.locator(".monaco-editor").first().waitFor({ timeout: 30_000 })
  await page.locator(".sidebar").getByText("long.pdf").click()
  await expect(page.locator(".pdfViewer .page")).toHaveCount(PAGES)
  await expect(page.locator('.page[data-page-number="1"] canvas')).toBeAttached()
  return page.locator(".pdf-viewer-container").last()
}

const sheetWidth = async (page: Page) =>
  (await page.locator('.page[data-page-number="1"]').boundingBox())!.width

const editorFontSize = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("comdtex_settings") ?? "{}").fontSize ?? null)

async function selectText(page: Page, pageNumber: number, text: string) {
  const span = page
    .locator(`.page[data-page-number="${pageNumber}"] .textLayer span`, { hasText: text })
    .first()
  await expect(span).toBeAttached()
  const b = (await span.boundingBox())!
  await page.mouse.move(b.x + 2, b.y + b.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width - 2, b.y + b.height / 2, { steps: 6 })
  await page.mouse.up()
}

test("scrolling a long PDF renders the end without keeping every page", async ({ page }) => {
  const pane = await openPdf(page)
  await pane.evaluate((el) => (el.scrollTop = el.scrollHeight))
  await expect(page.locator(`.page[data-page-number="${PAGES}"] canvas`)).toBeAttached()
  expect(await page.locator(".pdfViewer .page canvas").count()).toBeLessThanOrEqual(12)
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
  await expect(page.getByRole("combobox", { name: "Zoom" })).toHaveValue("page-width")
  expect(await editorFontSize(page)).toBe(font)
})

test("the page box jumps to a page", async ({ page }) => {
  await openPdf(page)
  const box = page.getByRole("textbox", { name: "Go to page" })
  await box.fill("25")
  await box.press("Enter")
  await expect(page.locator('.page[data-page-number="25"]')).toBeInViewport()
  await expect(box).toHaveValue("25")
})

test("Ctrl+F finds text across the PDF and steps through the hits", async ({ page }) => {
  await openPdf(page)
  await page.locator(".pdf-viewer-container").last().focus()
  await page.keyboard.press("Control+f")
  const input = page.getByRole("searchbox", { name: "Find in PDF" })
  await expect(input).toBeFocused()
  await input.fill("Page 30")
  await expect(page.locator(".pdf-find-count")).toHaveText("1 of 1")
  await expect(page.locator(".textLayer .highlight.selected")).toBeInViewport()
  // A new search starts from the page in view (page 30 here), as in pdf.js.
  await input.fill("Cheeger")
  await expect(page.locator(".pdf-find-count")).toHaveText(`30 of ${PAGES}`)
  await input.press("Enter")
  await expect(page.locator(".pdf-find-count")).toHaveText(`31 of ${PAGES}`)
  await input.press("Shift+Enter")
  await expect(page.locator(".pdf-find-count")).toHaveText(`30 of ${PAGES}`)
  await input.press("Escape")
  await expect(input).toBeHidden()
})

test("search works where ReadableStream cannot be iterated (WebKitGTK 2.50)", async ({ page }) => {
  await openPdf(page, { webkit250: true })
  await page.getByRole("button", { name: "Find in PDF" }).click()
  await page.getByRole("searchbox", { name: "Find in PDF" }).fill("Cheeger")
  await expect(page.locator(".pdf-find-count")).toHaveText(`1 of ${PAGES}`)
  await expect(page.locator('.page[data-page-number="1"] .textLayer span').first()).toBeAttached()
})

test("highlight, text and drawing tools annotate the PDF and save it", async ({ page }) => {
  await openPdf(page)
  const save = page.locator(".pdf-save-btn")

  await page.getByRole("button", { name: "Highlight", exact: true }).click()
  await expect(page.getByRole("toolbar", { name: "Colour" })).toBeVisible()
  await selectText(page, 1, "Spectral gaps")
  await expect(page.locator(".annotationEditorLayer .highlightEditor")).toHaveCount(1)
  await expect(save).toHaveClass(/pending/)

  await page.getByRole("button", { name: "Add text" }).click()
  const p1 = (await page.locator('.page[data-page-number="1"]').boundingBox())!
  // Points inside the view: at fit width the page is taller than the pane.
  await page.mouse.click(p1.x + p1.width * 0.6, p1.y + 330)
  await page.keyboard.type("Check this")
  // Escape commits the note, as in pdf.js.
  await page.keyboard.press("Escape")
  await page.getByRole("button", { name: "Add text" }).click()
  await expect(page.locator(".annotationEditorLayer .freeTextEditor")).toHaveCount(1)

  await page.getByRole("button", { name: "Draw" }).click()
  await page.getByRole("button", { name: "Colour: Red" }).click()
  await page.mouse.move(p1.x + 100, p1.y + 420)
  await page.mouse.down()
  await page.mouse.move(p1.x + 300, p1.y + 470, { steps: 10 })
  await page.mouse.up()
  await page.getByRole("button", { name: "Draw" }).click()
  await expect(page.locator(".annotationEditorLayer .inkEditor")).toHaveCount(1)

  // Written into the PDF shortly after the last change.
  await expect(save).not.toHaveClass(/pending/, { timeout: 15_000 })
  await expect(save).toBeDisabled()

  // Undo takes the drawing back.
  await page.getByRole("button", { name: "Undo" }).click()
  await expect(page.locator(".annotationEditorLayer .inkEditor")).toHaveCount(0)
})
