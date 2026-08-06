import { expect, test } from "@playwright/test"

// Regression test for "Mermaid diagrams render shapes but no label text".
//
// Root cause: DOMPurify ships `foreignobject` in DEFAULT_FORBID_CONTENTS, so
// `sanitizeRenderedHtml` kept every <foreignObject> but dropped its children.
// Mermaid's default `htmlLabels: true` renders labels as HTML inside
// <foreignObject> => every node came out empty. `MERMAID_CONFIG` now sets
// `htmlLabels: false`, so labels are native SVG <text>/<tspan>, which the
// sanitizer passes through untouched.
//
// This has to run in a real browser: Mermaid measures native SVG text with
// `getComputedTextLength()`, which jsdom does not implement.

type RenderReport = {
  rawHasForeignObject: boolean
  safeHasForeignObject: boolean
  texts: string[]
  overflowing: string[]
}

async function report(page: import("@playwright/test").Page) {
  await page.goto("/e2e/fixtures/mermaid-render.html")
  await page.waitForFunction(() => (window as unknown as { __MERMAID_DONE__?: boolean }).__MERMAID_DONE__ === true, undefined, { timeout: 30_000 })
  return page.evaluate(
    () => (window as unknown as { __MERMAID_REPORT__: Record<string, RenderReport> }).__MERMAID_REPORT__,
  )
}

test("the user's decision-cycle flowchart keeps its node labels after sanitization", async ({ page }) => {
  const all = await report(page)
  const r = all.decisionCycle as RenderReport

  // The whole point: Mermaid must not emit foreignObject at all any more.
  expect(r.rawHasForeignObject).toBe(false)
  expect(r.safeHasForeignObject).toBe(false)

  // Labels survive the real sanitizer. `texts` joins each <tspan>, so a
  // wrapped label loses its spaces; match on the wrap-free fragments.
  const joined = r.texts.join(" | ")
  expect(joined).toContain("Descartar")
  expect(joined).toContain("Decisión")
  expect(joined).toContain("oportunidad o")
  expect(joined).toContain("plata y")
  expect(joined).toContain("Ciclo de")

  // Every node has a non-empty label (the bug rendered all of them blank).
  expect(r.texts.length).toBeGreaterThan(8)
})

test("special characters and accents survive without securityLevel loose", async ({ page }) => {
  const all = await report(page)
  const r = all.binarySearch as RenderReport
  const joined = r.texts.join(" | ")

  // `↺` on loop-back edges: the char the old `securityLevel: "loose"` comment
  // claimed to require. It renders fine under Mermaid's default strict level.
  expect(joined).toContain("↺")
  expect(joined).toContain("WHILE lo ≤ hi")
  expect(joined).toContain("mid ← (lo + hi) / 2")
  expect(joined).toContain("Búsqueda")
})

test("labels do not overflow their shapes with native SVG text", async ({ page }) => {
  const all = await report(page)
  for (const [name, r] of Object.entries(all)) {
    expect((r as RenderReport).overflowing, `${name} has overflowing labels`).toEqual([])
  }
})

test("every diagram type renders labels without foreignObject", async ({ page }) => {
  const all = await report(page)
  for (const [name, raw] of Object.entries(all)) {
    const r = raw as RenderReport
    expect(r, `${name} failed to render`).not.toHaveProperty("error")
    expect(r.rawHasForeignObject, `${name} still emits foreignObject`).toBe(false)
    expect(r.texts.length, `${name} rendered no label text`).toBeGreaterThan(0)
  }
})
