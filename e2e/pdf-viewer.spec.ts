import { expect, test, type Page } from "@playwright/test"
import { installDeterminism } from "./support/deterministic"
import { installFakeVault } from "./support/fakeVault"
import { tinyPdf } from "./support/tinyPdf"

// The PDF viewer used to keep a full-resolution canvas for every page it had
// ever shown and to start a render for each page entering the view at once,
// which made scrolling a long PDF crawl in the desktop app. It now paints one
// page at a time and frees pages far from the view.

const PAGES = 14

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
  const pane = page.locator(".pdf-pages").last()
  return pane
}

const painted = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLCanvasElement>(".pdf-page canvas")]
      .filter((c) => c.width > 0)
      .map((c) => Number(c.dataset.page)),
  )

test("scrolling a long PDF keeps only the pages around the view painted", async ({ page }) => {
  const pane = await openPdf(page)
  await expect.poll(async () => (await painted(page)).includes(1)).toBe(true)
  await pane.evaluate((el) => (el.scrollTop = el.scrollHeight))
  await expect.poll(async () => (await painted(page)).includes(PAGES)).toBe(true)
  const live = await painted(page)
  expect(live).not.toContain(1)
  expect(live.length).toBeLessThanOrEqual(8)
})

test("zooming in from fit-to-width enlarges the page and keeps its left edge reachable", async ({
  page,
}) => {
  const pane = await openPdf(page)
  const sheet = page.locator(".pdf-page").first()
  const before = (await sheet.boundingBox())!.width
  await page.locator(".pdf-toolbar-btn").nth(4).click()
  await expect.poll(async () => (await sheet.boundingBox())!.width).toBeGreaterThan(before)
  await pane.evaluate((el) => (el.scrollLeft = 0))
  const paneBox = (await pane.boundingBox())!
  expect((await sheet.boundingBox())!.x).toBeGreaterThanOrEqual(paneBox.x - 1)
})
