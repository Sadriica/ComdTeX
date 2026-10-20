import type { Page } from "@playwright/test"

// Makes screenshots reproducible: no animation or transition frames, no caret
// blink, no overlay scrollbars (Monaco draws its own), no minimap viewport
// slider. Injected on every document so it survives navigations.
export const FREEZE_CSS = `
*, *::before, *::after {
  animation: none !important;
  transition: none !important;
  caret-color: transparent !important;
  scroll-behavior: auto !important;
}
.monaco-editor .cursors-layer .cursor { visibility: hidden !important; }
.monaco-scrollable-element > .scrollbar,
.monaco-scrollable-element > .shadow,
.monaco-editor .minimap-slider,
.monaco-editor .minimap-shadow-visible { visibility: hidden !important; }
* { scrollbar-width: none !important; }
*::-webkit-scrollbar { display: none !important; }
`

/** Call once per page, before `goto`. */
export async function installDeterminism(page: Page) {
  await page.addInitScript((css) => {
    const apply = () => {
      if (document.getElementById("visual-freeze")) return
      const el = document.createElement("style")
      el.id = "visual-freeze"
      el.textContent = css
      document.head.appendChild(el)
    }
    if (document.head) apply()
    else document.addEventListener("DOMContentLoaded", apply)
  }, FREEZE_CSS)
}

/**
 * Wait for the graph panel's force layout to finish. The graph root carries
 * `data-layout="done"` once it settles; a panel without the attribute (older
 * build, or no graph on screen) is not waited for. Times out quietly.
 */
export async function waitForGraphLayout(page: Page, timeout = 5000) {
  const root = page.locator("[data-layout]").first()
  if (!(await root.count())) return
  await page
    .locator('[data-layout="done"]')
    .first()
    .waitFor({ timeout })
    .catch(() => {})
}

/** Park the pointer so no hover state leaks into the shot, and let fonts settle. */
export async function quiesce(page: Page) {
  await page.mouse.move(0, 0)
  await page.evaluate(() => document.fonts.ready)
}
