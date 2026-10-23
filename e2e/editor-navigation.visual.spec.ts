import { mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { expect, test } from "@playwright/test"
import { quiesce } from "./support/deterministic"
import { boxOf, openVault, revealLine } from "./support/editorNav"

// Shots of the hover card on a reference and of the references peek, per theme.
// Runs with the visual harness only:
//   VISUAL=1 VISUAL_SHOTS=dark,light,hc npx playwright test -c playwright.visual.config.ts editor-navigation

test.skip(process.env.VISUAL !== "1", "visual harness runs only with VISUAL=1")

const OUT = resolve(process.env.VISUAL_OUT ?? "e2e/visual-out")
const THEMES = [
  { name: "dark", theme: "vs-dark" },
  { name: "light", theme: "vs" },
  { name: "hc", theme: "hc-black" },
].filter((t) => !process.env.VISUAL_SHOTS || process.env.VISUAL_SHOTS.split(",").includes(t.name))

for (const { name, theme } of THEMES) {
  test(`visual ${name}: reference hover and usages peek`, async ({ page }) => {
    test.setTimeout(120_000)
    mkdirSync(OUT, { recursive: true })
    const errors = await openVault(page, theme)
    await revealLine(page, 44)

    // Hover card on a reference to a lemma.
    const ref = await boxOf(page, "@lem:cheeger with")
    const hoverX = ref.x + 30
    await page.mouse.move(hoverX - 40, ref.y + ref.h / 2)
    await page.mouse.move(hoverX, ref.y + ref.h / 2, { steps: 8 })
    await page.locator(".monaco-hover:not(.hidden)").first().waitFor({ timeout: 8000 })
    await expect(page.locator(".monaco-hover:not(.hidden)")).toContainText("Cheeger-type bound")
    await page.waitForTimeout(400)
    // No quiesce here: parking the pointer would dismiss the hover being shot.
    await page.screenshot({ path: resolve(OUT, `${name}__nav-hover__reference.png`) })

    // Usages peek (Shift+F12).
    await page.mouse.move(5, 5)
    await page.mouse.click(hoverX, ref.y + ref.h / 2)
    await page.keyboard.press("Shift+F12")
    await page.locator(".reference-zone-widget, .zone-widget.peekview-widget").first().waitFor()
    await page.waitForTimeout(600)
    await quiesce(page)
    await page.screenshot({ path: resolve(OUT, `${name}__nav-usages__peek.png`) })
    expect(errors).toEqual([])
  })
}
