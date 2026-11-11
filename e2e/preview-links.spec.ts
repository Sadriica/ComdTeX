import { expect, test, type Page } from "@playwright/test"
import { readFileSync } from "node:fs"
import { installDeterminism } from "./support/deterministic"
import { installFakeVault } from "./support/fakeVault"

// Links and images in the preview of a note that lives in a subfolder: the
// welcome file's biology example. Until 1.33 a wikilink click did nothing (the
// in-page anchor branch swallowed `href="#"`), and `figure.svg` beside the
// note rendered broken because images were never in the vault's file list.

async function open(page: Page) {
  await page.setViewportSize({ width: 1440, height: 700 })
  await installDeterminism(page)
  await installFakeVault(page, {
    settings: { theme: "vs-dark", language: "es" },
    tabs: ["comdtex.md", "comdtex-examples/comdtex-biology.md"],
    files: {
      "comdtex.md": readFileSync("src/welcome/comdtex.es.md", "utf8"),
      "comdtex-examples/comdtex-biology.md": readFileSync("src/welcome/biology.es.md", "utf8"),
      "comdtex-examples/figure.svg": readFileSync("src/welcome/figure.svg", "utf8"),
      "comdtex-examples/growth.csv": readFileSync("src/welcome/growth.csv", "utf8"),
      "comdtex-examples/stats.csv": readFileSync("src/welcome/stats.csv", "utf8"),
      "comdtex-examples/model.json": readFileSync("src/welcome/model.json", "utf8"),
    },
    storage: {
      comdtex_deps_dismissed: JSON.stringify(["pandoc", "zip"]),
      comdtex_welcome_seeded: "1",
    },
  })
  await page.goto("/")
  await page.locator(".preview-content [data-source-line]").first().waitFor({ timeout: 30_000 })
}

async function openBiology(page: Page) {
  await open(page)
  await page.locator(".tab", { hasText: "comdtex-biology.md" }).first().click()
  await expect(page.locator(".preview-content a.tbl-ref").first()).toBeVisible()
}

test("a figure next to a note in a subfolder loads", async ({ page }) => {
  await openBiology(page)
  const img = page.locator(".preview-content figure.fig-block img").first()
  await expect
    .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0)
})

test("a table reference scrolls the preview to the table", async ({ page }) => {
  await openBiology(page)
  const target = page.locator('.preview-content [id="tbl-resumen"]')
  // The preview morphs in place after late renders (data blocks, plots), so the
  // click is retried until it lands on the settled link.
  await expect(async () => {
    const ref = page.locator(".preview-content a.tbl-ref").first()
    await ref.scrollIntoViewIfNeeded()
    await ref.click()
    await expect(target).toBeInViewport({ timeout: 2_000 })
  }).toPass()
})

test("a wikilink in the preview opens the note", async ({ page }) => {
  await open(page)
  await page.locator(".tab", { hasText: "comdtex.md" }).first().click()
  const link = page.locator(".preview-content .wikilink", { hasText: "comdtex-biology" }).last()
  await link.scrollIntoViewIfNeeded()
  await link.click()
  await expect(page.locator(".tab.tab-active")).toContainText("comdtex-biology.md")
})

test("a bare file name is not a web link", async ({ page }) => {
  await open(page)
  await page.locator(".tab", { hasText: "comdtex.md" }).first().click()
  await expect(
    page.locator(".preview-content strong", { hasText: "macros.md" }).first(),
  ).not.toContainText("http")
  await expect(page.locator('.preview-content a[href*="macros.md"]')).toHaveCount(0)
})
