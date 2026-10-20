import { mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { expect, test, type Page } from "@playwright/test"
import { installDeterminism, quiesce } from "./support/deterministic"
import { installFakeVault } from "./support/fakeVault"

// Shots of the linter: the markers in the editor and the Ctrl+. quick-fix menu,
// per theme. Same rules as visual.spec.ts: only with VISUAL=1, output in
// e2e/visual-out/ (VISUAL_SHOTS narrows the themes).

test.skip(process.env.VISUAL !== "1", "visual harness runs only with VISUAL=1")

const OUT = resolve(process.env.VISUAL_OUT ?? "e2e/visual-out")
const THEMES = [
  { name: "dark", theme: "vs-dark" },
  { name: "light", theme: "vs" },
  { name: "hc", theme: "hc-black" },
].filter((t) => !process.env.VISUAL_SHOTS || process.env.VISUAL_SHOTS.split(",").includes(t.name))

const NOTE = `# Lint demo

:::theorem[Main result]{#thm:main}
Every finite group has an identity.
:::

By @thm:mian we conclude, as shown in [@lost2020].

See [[brand-new-note]], the rule frac(a) and $\\notacommand$ here.

| a | b |
|---|---|
| 1 |

A claim[^n1] with a figure ![plot](fig/none.png).

:::theorm
Left open on purpose.
`

async function clickOn(page: Page, lineNeedle: string, target: string) {
  const point = await page.evaluate(
    ({ lineNeedle, target }) => {
      const line = [...document.querySelectorAll(".view-line")].find((l) =>
        (l.textContent ?? "").replace(/ /g, " ").includes(lineNeedle),
      )
      if (!line) return null
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
      const nodes: Text[] = []
      while (walker.nextNode()) nodes.push(walker.currentNode as Text)
      const full = nodes
        .map((n) => n.data)
        .join("")
        .replace(/ /g, " ")
      const at = full.indexOf(target)
      if (at < 0) return null
      const mid = at + Math.floor(target.length / 2)
      let seen = 0
      for (const node of nodes) {
        if (mid < seen + node.data.length) {
          const range = document.createRange()
          range.setStart(node, mid - seen)
          range.setEnd(node, mid - seen + 1)
          const r = range.getBoundingClientRect()
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
        }
        seen += node.data.length
      }
      return null
    },
    { lineNeedle, target },
  )
  expect(point, `"${target}" on screen`).not.toBeNull()
  await page.mouse.click(point!.x, point!.y)
}

for (const { name, theme } of THEMES) {
  test(`visual ${name}: linter markers and quick fixes`, async ({ page }) => {
    test.setTimeout(120_000)
    mkdirSync(OUT, { recursive: true })
    await page.setViewportSize({ width: 1440, height: 900 })
    await installDeterminism(page)
    await installFakeVault(page, {
      settings: { theme },
      tabs: ["notes/lint-demo.md"],
      storage: { comdtex_deps_dismissed: JSON.stringify(["pandoc", "zip"]) },
      files: { "notes/lint-demo.md": NOTE },
    })
    await page.goto("/")
    await page.locator(".monaco-editor").first().waitFor({ timeout: 30_000 })
    await expect(page.locator(".squiggly-warning").first()).toBeVisible({ timeout: 15_000 })
    await expect(page.locator(".squiggly-error").first()).toBeVisible({ timeout: 15_000 })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(700)

    await quiesce(page)
    await page.screenshot({ path: resolve(OUT, `${name}__lint__markers.png`) })

    await clickOn(page, "By @thm:mian", "@thm:mian")
    await page.keyboard.press("Control+.")
    await expect(page.locator(".context-view .actionList, .action-widget").first()).toBeVisible()
    await page.waitForTimeout(300)
    await page.screenshot({ path: resolve(OUT, `${name}__lint__quickfix-menu.png`) })
    await page.keyboard.press("Escape")

    // The other kinds of fix menu, to see each entry's wording.
    await clickOn(page, "brand-new-note", "brand-new-note")
    await page.keyboard.press("Control+.")
    await expect(page.locator(".context-view .actionList, .action-widget").first()).toBeVisible()
    await page.waitForTimeout(300)
    await page.screenshot({ path: resolve(OUT, `${name}__lint__quickfix-note.png`) })
    await page.keyboard.press("Escape")
  })
}
