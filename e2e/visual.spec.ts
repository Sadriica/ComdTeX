import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { expect, test, type Page } from "@playwright/test"
import { installDeterminism, quiesce, waitForGraphLayout } from "./support/deterministic"
import { installFakeVault } from "./support/fakeVault"

// Visual harness: full-window PNGs of every reachable UI state, per theme, so
// the UI can be reviewed and regression-compared. Slow, so it only runs when
// VISUAL=1 (use `npm run test:visual`, which also selects the system Chrome):
//
//   VISUAL=1 npx playwright test -c playwright.visual.config.ts
//
// Output goes to e2e/visual-out/ (gitignored) as `<theme>__<state>__<detail>.png`.
// VISUAL_SHOTS=dark,light narrows the themes; VISUAL_OUT overrides the folder.

test.skip(process.env.VISUAL !== "1", "visual harness runs only with VISUAL=1")

const OUT = resolve(process.env.VISUAL_OUT ?? "e2e/visual-out")
const THEMES = [
  { name: "dark", theme: "vs-dark" },
  { name: "light", theme: "vs" },
  { name: "hc", theme: "hc-black" },
].filter((t) => !process.env.VISUAL_SHOTS || process.env.VISUAL_SHOTS.split(",").includes(t.name))

const PAPER = "papers/spectral-gap.md"
const noise = ["Failed to load resource", "[vite]", "React DevTools"]

/** Attach console/page error collectors; returns the live list. */
function watchErrors(page: Page, label: string) {
  const errors: string[] = []
  page.on("console", (m) => {
    if (m.type() === "error" && !noise.some((n) => m.text().includes(n)))
      errors.push(`${label}: ${m.text().slice(0, 300)}`)
  })
  page.on("pageerror", (e) => errors.push(`${label} pageerror: ${e.message.slice(0, 300)}`))
  return errors
}

/** Wait for fonts, KaTeX, Mermaid and Monaco to stop changing. */
async function settle(page: Page, opts: { math?: boolean; mermaid?: boolean } = {}) {
  await page.evaluate(() => document.fonts.ready)
  if (opts.math)
    await page
      .locator(".preview-content .katex")
      .first()
      .waitFor({ timeout: 15_000 })
      .catch(() => {})
  if (opts.mermaid) {
    await page
      .locator(".preview-content svg[id^='mermaid'], .preview-content .mermaid svg")
      .first()
      .waitFor({ timeout: 15_000 })
      .catch(() => {})
  }
  await page.waitForTimeout(700)
  await page.evaluate(() => document.fonts.ready)
}

async function shot(page: Page, theme: string, name: string, vp = "") {
  mkdirSync(OUT, { recursive: true })
  await waitForGraphLayout(page)
  await quiesce(page)
  await page.screenshot({ path: resolve(OUT, `${theme}__${name}${vp}.png`) })
}

/** Dropdown section (Files/Texts/Math/Views) -> item. */
async function openFromMenu(page: Page, section: string, item: string) {
  await page.locator(`.menubar-section-btn[title="${section}"]`).click()
  await page
    .locator(".menubar-popup .menu-list-item")
    .filter({ hasText: new RegExp(`^\\s*(?:\\S\\s+)?${item}\\s*$`) })
    .first()
    .click()
  await page.waitForTimeout(500)
}

async function palette(page: Page, query: string) {
  await page.keyboard.press("Control+p")
  await page.locator(".palette-input").fill(query)
  await page.waitForTimeout(250)
}

async function closeOverlays(page: Page) {
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Escape")
    await page.waitForTimeout(100)
  }
  // The table editor and the citation manager ignore Escape; use their own buttons.
  const cancel = page.locator(".table-editor-modal .btn-cancel, .cit-manager-close")
  if (await cancel.count()) await cancel.first().click()
}

async function scrollPreviewTo(page: Page, text: string) {
  await page.evaluate((t) => {
    const pane = document.querySelector("#preview-pane") as HTMLElement | null
    const el = [
      ...document.querySelectorAll(
        "#preview-pane h1, #preview-pane h2, #preview-pane figcaption, #preview-pane .env-title",
      ),
    ].find((n) => n.textContent?.includes(t)) as HTMLElement | undefined
    if (pane && el) pane.scrollTop = el.offsetTop - 40
  }, text)
  await page.waitForTimeout(500)
}

for (const { name, theme } of THEMES) {
  test(`visual ${name}: welcome and dependency banner`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true })
    const errors = watchErrors(page, name)
    await page.setViewportSize({ width: 1440, height: 900 })
    await installDeterminism(page)
    await installFakeVault(page, { open: false, settings: { theme } })
    await page.goto("/")
    await page.locator(".welcome-logo").waitFor()
    await settle(page)
    await shot(page, name, "welcome")
    writeFileSync(resolve(OUT, `${name}__welcome-console-errors.txt`), errors.join("\n") + "\n")
  })

  test(`visual ${name}: vault, panels and dialogs`, async ({ page }) => {
    test.setTimeout(240_000)
    const errors = watchErrors(page, name)
    await page.setViewportSize({ width: 1440, height: 900 })
    await installDeterminism(page)
    await installFakeVault(page, {
      settings: { theme },
      storage: { comdtex_deps_dismissed: JSON.stringify(["pandoc", "zip"]) },
    })
    await page.goto("/")
    await page.locator(".monaco-editor").first().waitFor({ timeout: 30_000 })
    await settle(page, { math: true })

    // Editor + preview split on the paper.
    await expect(page.locator(".tab-name", { hasText: "spectral-gap.md" })).toBeVisible()
    await shot(page, name, "editor-split__paper")
    await scrollPreviewTo(page, "Main results")
    await shot(page, name, "preview-scrolled__main-results")
    await scrollPreviewTo(page, "Experiments")
    await settle(page, { mermaid: true })
    await shot(page, name, "preview-scrolled__experiments")
    await page.evaluate(() => {
      const pane = document.querySelector("#preview-pane") as HTMLElement
      pane.scrollTop = pane.scrollTop + 640
    })
    await page.waitForTimeout(600)
    await shot(page, name, "preview-scrolled__diagrams")
    await page.evaluate(() => {
      const pane = document.querySelector("#preview-pane") as HTMLElement
      pane.scrollTop = pane.scrollHeight
    })
    await page.waitForTimeout(600)
    await shot(page, name, "preview-scrolled__end-bibliography")

    // Other tabs: Spanish note, wikilinked note.
    await page.locator(".tab-name", { hasText: "nota-espanol.md" }).click()
    await settle(page, { math: true })
    await shot(page, name, "editor-split__nota-espanol")
    await page.locator(".tab-name", { hasText: "spectral-gap.md" }).click()
    await settle(page, { math: true })

    // Editor only (preview toggled off with Ctrl+;).
    await page.keyboard.press("Control+Shift+p")
    await page.waitForTimeout(700)
    await shot(page, name, "editor-only__paper")
    await page.keyboard.press("Control+Shift+p")
    await settle(page, { math: true })

    // Sidebar panels reachable from the toolbar.
    const panels: [string, string, string][] = [
      ["Files", "Files", "files"],
      ["Texts", "Outline", "outline"],
      ["Files", "Search", "search"],
      ["Files", "Find & Replace", "find-replace"],
      ["Files", "Backlinks", "backlinks"],
      ["Texts", "Tags", "tags"],
      ["Texts", "Labels", "labels"],
      ["Texts", "Properties", "properties"],
      ["Texts", "Comments", "comments"],
      ["Texts", "Tasks", "todo"],
      ["Math", "Equations", "equations"],
      ["Math", "Environments", "environments"],
      ["Math", "Graph", "graph"],
      ["Views", "Keep", "keep"],
      ["Views", "Statistics", "stats"],
      ["Views", "Diagnostics", "document-lab"],
      ["Files", "PDF", "pdf-preview"],
    ]
    for (const [section, item, slug] of panels) {
      await openFromMenu(page, section, item)
      if (slug === "search") {
        await page.locator(".sidebar input").first().fill("expander")
        await page.keyboard.press("Enter")
      }
      await settle(page)
      await shot(page, name, `panel__${slug}`)
    }
    await openFromMenu(page, "Files", "Files")

    // Direct buttons: Help, Sync, AI (disabled state).
    for (const [label, slug] of [
      ["Help", "help"],
      ["Sync", "sync"],
      ["AI assistant", "ai-disabled"],
    ]) {
      await page.locator(`.menubar-direct-btn[title="${label}"]`).click()
      await settle(page)
      await shot(page, name, `panel__${slug}`)
    }
    await openFromMenu(page, "Files", "Files")

    // Symbol picker (inline grid inside the Math menu).
    await page.locator('.menubar-section-btn[title="Math"]').click()
    await page.locator(".menu-sub-trigger", { hasText: "Symbols" }).first().click()
    await page.waitForTimeout(500)
    await shot(page, name, "menu__symbol-picker")
    await closeOverlays(page)

    // Open dropdowns.
    await page.locator('.menubar-section-btn[title="Texts"]').click()
    await page.waitForTimeout(300)
    await shot(page, name, "menu__texts")
    await closeOverlays(page)

    // Classic menu bar + git popover.
    await page
      .locator(".menubar-section-btn", { hasText: /^\s*\S*\s*Git|git/i })
      .first()
      .click({ timeout: 3000 })
      .catch(() => {})
    await page
      .getByText("git?")
      .first()
      .click({ timeout: 3000 })
      .catch(() => {})
    await page.waitForTimeout(700)
    await shot(page, name, "panel__git")
    await closeOverlays(page)

    // Command palette (empty, then filtered).
    await page.keyboard.press("Control+p")
    await page.locator(".palette-input").waitFor()
    await page.waitForTimeout(400)
    await shot(page, name, "command-palette")
    await page.locator(".palette-input").fill("flowchart")
    await page.waitForTimeout(300)
    await shot(page, name, "command-palette__filtered")
    await closeOverlays(page)

    // Citation manager.
    await palette(page, "citation manager")
    await page.keyboard.press("Enter")
    await page.waitForTimeout(900)
    await shot(page, name, "modal__citation-manager")
    await closeOverlays(page)

    // Table editor.
    await palette(page, "table editor")
    await page.keyboard.press("Enter")
    await page
      .locator(".table-editor-dialog")
      .waitFor({ timeout: 5000 })
      .catch(() => {})
    await page.waitForTimeout(500)
    await shot(page, name, "modal__table-editor")
    await closeOverlays(page)

    // Template modal.
    await palette(page, "from template")
    await page.keyboard.press("Enter")
    await page.waitForTimeout(800)
    await shot(page, name, "modal__templates")
    await closeOverlays(page)

    // Keyboard shortcuts modal ("?" outside a text input).
    await page
      .locator(".titlebar")
      .first()
      .click({ position: { x: 400, y: 10 } })
      .catch(() => {})
    await page.keyboard.press("?")
    await page.waitForTimeout(600)
    await shot(page, name, "modal__shortcuts")
    await closeOverlays(page)

    // Focus popover.
    await page.locator('.menubar-direct-btn[title="Focus"]').click()
    await page.waitForTimeout(500)
    await shot(page, name, "popover__focus")
    await page.locator('.menubar-direct-btn[title="Focus"]').click()
    await page.waitForTimeout(300)

    // Toast (focus mode on/off message).
    await page.keyboard.press("F11")
    await page.waitForTimeout(500)
    await shot(page, name, "toast__focus-mode")
    await page.keyboard.press("F11")
    // Let the stacked toasts expire (3.5s, 6s for errors) so they do not leak into later shots.
    await page.waitForTimeout(6500)

    // Context menu on the file tree.
    await page.locator(".sidebar").getByText("mixing-times.md").click({ button: "right" })
    await page.waitForTimeout(300)
    await shot(page, name, "context-menu__file-tree")
    await closeOverlays(page)

    // Settings modal, every tab.
    await page.locator(".titlebar-settings-btn").click()
    await page.locator(".settings-tab").first().waitFor()
    const tabCount = await page.locator(".settings-tab").count()
    for (let i = 0; i < tabCount; i++) {
      await page.locator(".settings-tab").nth(i).click()
      await page.waitForTimeout(300)
      await shot(
        page,
        name,
        `settings__tab-${i + 1}-${["general", "editor", "preview", "daily-notes", "pdf", "sync", "ai"][i] ?? i}`,
      )
    }
    await closeOverlays(page)

    // Console errors are reported, not asserted: the harness records the UI, it does not gate it.
    writeFileSync(resolve(OUT, `${name}__console-errors.txt`), errors.join("\n") + "\n")
  })

  test(`visual ${name}: dependency banner and narrow window`, async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 700 })
    await installDeterminism(page)
    await installFakeVault(page, { settings: { theme } })
    await page.goto("/")
    await page.locator(".monaco-editor").first().waitFor({ timeout: 30_000 })
    await settle(page, { math: true })
    await shot(page, name, "editor-split__paper-with-deps-banner", "__1024x700")
    await page.locator(".sidebar-collapse-btn").click()
    await page.waitForTimeout(300)
    await shot(page, name, "editor-split__paper-sidebar-collapsed", "__1024x700")
    await page.locator(".sidebar-collapse-btn").click({ force: true })
    await openFromMenu(page, "Math", "Equations")
    await shot(page, name, "panel__equations", "__1024x700")
  })
}
