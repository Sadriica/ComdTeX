import { expect, test, type Page } from "@playwright/test"
import { installDeterminism } from "./support/deterministic"
import { installFakeVault } from "./support/fakeVault"

// The linter marks a broken reference; Ctrl+. offers a quick fix; applying it
// rewrites the line in the editor. Runs against the fake vault, so nothing
// touches the disk.

const NOTE = `# Lint demo

:::theorem[Main result]{#thm:main}
Every finite group has an identity.
:::

By @thm:mian we conclude the argument.

Also see [[brand-new-note]] and cite [@lost2020].
`

async function openDemo(page: Page) {
  await installDeterminism(page)
  await installFakeVault(page, {
    settings: { theme: "vs-dark" },
    tabs: ["notes/lint-demo.md"],
    files: { "notes/lint-demo.md": NOTE },
  })
  await page.goto("/")
  await page.locator(".monaco-editor").first().waitFor({ timeout: 30_000 })
  await expect(page.locator(".view-lines")).toContainText("By @thm:mian")
}

async function lineText(page: Page, needle: string): Promise<string> {
  return (await page.locator(".view-line", { hasText: needle }).first().innerText()).replace(
    /\u00a0/g,
    " ",
  )
}

/** Click in the middle of `target` inside the rendered line that contains `lineNeedle`. */
async function clickOn(page: Page, lineNeedle: string, target: string) {
  const point = await page.evaluate(
    ({ lineNeedle, target }) => {
      const lines = [...document.querySelectorAll(".view-line")]
      const line = lines.find((l) =>
        (l.textContent ?? "").replace(/\u00a0/g, " ").includes(lineNeedle),
      )
      if (!line) return null
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
      // Monaco splits a line into token spans: find the substring across them.
      const nodes: Text[] = []
      while (walker.nextNode()) nodes.push(walker.currentNode as Text)
      const full = nodes
        .map((n) => n.data)
        .join("")
        .replace(/\u00a0/g, " ")
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

test("a broken @thm: reference is marked and Ctrl+. fixes it", async ({ page }) => {
  await openDemo(page)

  // The marker arrives after the lint debounce.
  const squiggle = page.locator(".squiggly-warning").first()
  await expect(squiggle).toBeVisible({ timeout: 10_000 })

  await clickOn(page, "By @thm:mian", "@thm:mian")
  await page.keyboard.press("Control+.")

  const menu = page.locator(".context-view .actionList, .action-widget")
  await expect(menu.first()).toBeVisible()
  await expect(menu.first()).toContainText('Change to "thm:main"')

  await page.keyboard.press("Enter")

  await expect.poll(() => lineText(page, "we conclude")).toContain("By @thm:main we conclude")
  // The fixed reference is no longer flagged: the squiggle on that line is gone.
  await expect
    .poll(
      async () =>
        page.locator(".view-line", { hasText: "we conclude" }).locator(".squiggly-warning").count(),
      {
        timeout: 10_000,
      },
    )
    .toBe(0)

  // One undo step brings the typo back.
  await page.keyboard.press("Control+z")
  await expect.poll(() => lineText(page, "we conclude")).toContain("By @thm:mian we conclude")
})

async function openQuickFixes(page: Page, lineNeedle: string, target: string) {
  await clickOn(page, lineNeedle, target)
  await page.keyboard.press("Control+.")
  const menu = page.locator(".context-view .actionList, .action-widget").first()
  await expect(menu).toBeVisible()
  return menu
}

test("Create note makes the missing note without leaving the document", async ({ page }) => {
  await openDemo(page)
  await expect(page.locator(".squiggly-warning").first()).toBeVisible({ timeout: 10_000 })

  const menu = await openQuickFixes(page, "brand-new-note", "brand-new-note")
  await expect(menu).toContainText('Create note "brand-new-note"')
  await page.keyboard.press("Enter")

  await expect(page.locator(".toast-container")).toContainText('Created note "brand-new-note"')
  // The writer stays on the note they were editing; the new one is in the tab bar.
  await expect(page.locator(".view-lines")).toContainText("By @thm:mian")
  await expect(page.locator(".tab-bar, [role=tablist]").first()).toContainText("brand-new-note")
  // The link is no longer broken once the vault refreshes.
  await expect
    .poll(
      async () =>
        page
          .locator(".view-line", { hasText: "brand-new-note" })
          .locator(".squiggly-warning")
          .count(),
      { timeout: 10_000 },
    )
    .toBe(0)
})

test("Add a BibTeX entry appends a stub to references.bib and clears the marker", async ({
  page,
}) => {
  await openDemo(page)
  await expect(page.locator(".squiggly-warning").first()).toBeVisible({ timeout: 10_000 })

  const menu = await openQuickFixes(page, "lost2020", "lost2020")
  await expect(menu).toContainText('Add a BibTeX entry for "lost2020" to references.bib')
  await page.keyboard.press("Enter")

  await expect(page.locator(".toast-container")).toContainText('Added "lost2020" to references.bib')
  await expect
    .poll(
      async () =>
        page.locator(".view-line", { hasText: "lost2020" }).locator(".squiggly-warning").count(),
      { timeout: 10_000 },
    )
    .toBe(0)
})
