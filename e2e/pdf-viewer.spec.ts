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
    files: { "long.pdf": tinyPdf(PAGES), "notes.md": "# Notes\n" },
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
  await span.scrollIntoViewIfNeeded()
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

test("the highlight tool follows the text, even from a drag that starts in the margin", async ({
  page,
}) => {
  await openPdf(page)
  await page.getByRole("button", { name: "Highlight", exact: true }).click()
  const span = page
    .locator('.page[data-page-number="1"] .textLayer span', { hasText: "Spectral gaps" })
    .first()
  const b = (await span.boundingBox())!
  // From the left margin, off the glyphs: pdf.js would draw a freehand stroke.
  await page.mouse.move(b.x - 30, b.y + b.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width * 0.6, b.y + b.height / 2, { steps: 8 })
  await page.mouse.up()
  await expect(page.locator(".annotationEditorLayer .highlightEditor")).toHaveCount(1)
  await expect(page.locator(".annotationEditorLayer .highlightEditor.free")).toHaveCount(0)
})

test("selecting text offers highlight, comment, copy and quote; all of it is saved and listed", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await openPdf(page)
  const menu = page.getByRole("toolbar", { name: "Selection" })

  // Highlight straight from the selection, then back to reading.
  await selectText(page, 1, "Spectral gaps")
  await expect(menu).toBeVisible()
  await menu.getByRole("button", { name: "Highlight in Green" }).click()
  await expect(page.locator(".annotationEditorLayer .highlightEditor")).toHaveCount(1)
  await expect(page.getByRole("button", { name: "Highlight", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  )

  // Copy as quote: Markdown with a link back to the page.
  await selectText(page, 2, "Spectral gaps")
  await menu.getByRole("button", { name: "Copy as quote" }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "> Spectral gaps and mixing times\n>\n> ([[long.pdf]], p. 2)\n",
  )

  // A comment on a selection: highlight plus the comment dialog.
  await selectText(page, 2, "the spectral gap controls")
  await menu.getByRole("button", { name: "Comment" }).click()
  const dialog = page.getByRole("dialog", { name: "Comment" })
  await dialog.getByRole("textbox").fill("Compare with Cheeger")
  await dialog.getByRole("button", { name: "Save" }).click()
  await expect(dialog).toBeHidden()

  // The Annotations panel lists both, in reading order, with the comment.
  await page.getByRole("button", { name: "Annotations", exact: true }).click()
  const panel = page.getByRole("complementary", { name: "Annotations" })
  await expect(panel.locator(".pdf-annotation")).toHaveCount(2)
  await expect(panel.locator(".pdf-annotation-text").first()).toHaveText(
    "Spectral gaps and mixing times",
  )
  await expect(panel.locator(".pdf-annotation-comment")).toHaveText("Compare with Cheeger")

  // Written into the PDF: reopening it shows them again.
  const save = page.locator(".pdf-save-btn")
  await expect(save).not.toHaveClass(/pending/, { timeout: 15_000 })
  await page.locator(".sidebar").getByText("notes.md", { exact: true }).click()
  await expect(page.locator(".pdfViewer")).toHaveCount(0)
  await page.locator(".sidebar").getByText("long.pdf").click()
  await expect(page.locator('.page[data-page-number="1"] canvas')).toBeAttached()
  await page.getByRole("button", { name: "Annotations", exact: true }).click()
  await expect(panel.locator(".pdf-annotation")).toHaveCount(2)
  await expect(panel.locator(".pdf-annotation-comment")).toHaveText("Compare with Cheeger")
  await expect(panel.locator(".pdf-annotations-page")).toHaveText(["Page 1", "Page 2"])

  // Exported into a reading note beside the PDF, which opens.
  await panel.getByRole("button", { name: "Export to a note" }).click()
  await expect(page.locator(".tab", { hasText: "long-annotations" })).toBeVisible()
  await expect(page.locator(".monaco-editor").first()).toContainText("Compare with Cheeger")
})

test("print draws every page, annotations included, and opens the print dialog", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.print = () => {
      const w = window as unknown as { __printed?: number }
      w.__printed = document.querySelectorAll(".pdf-print-root img").length
      window.dispatchEvent(new Event("afterprint"))
    }
  })
  await openPdf(page)
  await page.getByRole("button", { name: "Print" }).click()
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __printed?: number }).__printed), {
      timeout: 30_000,
    })
    .toBe(PAGES)
  // Cleaned up after the dialog.
  await expect(page.locator(".pdf-print-root")).toHaveCount(0)
})

test("the sidebar still collapses to a rail once the PDF viewer's styles are loaded", async ({
  page,
}) => {
  // pdf.js's stylesheet has a global .sidebar rule (180px minimum, 632px
  // maximum, a card border and shadow) that used to land on the app sidebar.
  await openPdf(page)
  const sidebar = page.locator(".main > .sidebar")
  await expect(sidebar).toHaveCSS("box-shadow", "none")
  await expect(sidebar).toHaveCSS("max-width", "none")
  await page.locator(".sidebar-collapse-btn").click()
  await expect(sidebar).toHaveClass(/sidebar-collapsed/)
  expect((await sidebar.boundingBox())!.width).toBeLessThanOrEqual(40)
})

test("a narrow PDF pane keeps the toolbar on one row and moves the rest to More tools", async ({
  page,
}) => {
  await openPdf(page)
  const bar = page.locator(".pdf-toolbar").first()
  const more = bar.getByRole("button", { name: "More tools" })
  await expect(more).toBeHidden()
  await expect(bar.getByRole("button", { name: "Print" })).toBeVisible()

  await page.setViewportSize({ width: 700, height: 900 })
  await expect(more).toBeVisible()
  await expect(bar.getByRole("button", { name: "Print" })).toBeHidden()
  expect((await bar.boundingBox())!.height).toBeLessThan(40)

  await more.click()
  const menu = page.getByRole("menu")
  await expect(menu.getByRole("menuitem", { name: "Print" })).toBeVisible()
  await expect(menu.getByRole("menuitem", { name: "Open in the system viewer" })).toBeVisible()
  // Exactly the buttons the toolbar hides; how many depends on the fonts.
  const hidden = await bar
    .locator("[data-overflow]")
    .evaluateAll((els) => els.filter((el) => getComputedStyle(el).display === "none").length)
  await expect(menu.getByRole("menuitem")).toHaveCount(hidden)
  await menu.getByRole("menuitem", { name: "Fit page" }).click()
  await expect(menu).toBeHidden()
  await expect(bar.locator(".pdf-zoom-select")).toHaveValue("page-fit")

  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(more).toBeHidden()
  await expect(bar.getByRole("button", { name: "Print" })).toBeVisible()
})
