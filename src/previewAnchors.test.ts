/**
 * @vitest-environment jsdom
 *
 * Cross-reference anchors must resolve against the *real* rendered preview DOM:
 * every `href="#..."` the renderer emits has to find its target element by the
 * same lookup the preview click handler uses (`App.tsx` → handlePreviewClick).
 */
import { describe, expect, it } from "vitest"
import { annotateSourceLines, renderMarkdown } from "./renderer"

const DOC = `# El ciclo de decisiones {#sec:decisiones}

Ver @tbl:decisiones y @fig:mapa.

| Decisión | Implicación |
|---|---|
| NO | Por múltiples factores |
| SI | Perfilar el proyecto |
{#tbl:decisiones}

![Mapa](mapa.png){#fig:mapa}

# Perfilar {#sec:perfilar}

Ver @sec:decisiones.

:::theorem[Main]{#thm:main}
Enunciado.
:::

Ver @thm:main.`

/** The exact target lookup performed by the preview click handler. */
function lookup(pane: HTMLElement, href: string): Element | null {
  const id = decodeURIComponent(href.slice(1))
  return id ? pane.querySelector(`[id="${id.replace(/["\\]/g, "\\$&")}"]`) : null
}

describe("preview cross-reference anchors", () => {
  // Exactly what the preview pane holds: rendered HTML + the source-line
  // annotation pass the click handler's fallback keys off.
  const pane = document.createElement("div")
  pane.innerHTML = annotateSourceLines(renderMarkdown(DOC), DOC)

  const anchors = [...pane.querySelectorAll('a[href^="#"]')] as HTMLAnchorElement[]

  it("renders cross-reference links for every family", () => {
    const hrefs = anchors.map((a) => a.getAttribute("href"))
    expect(hrefs).toContain("#sec-decisiones")
    expect(hrefs).toContain("#tbl-decisiones")
    expect(hrefs).toContain("#fig-mapa")
    expect(hrefs).toContain("#env-thm:main")
  })

  it("resolves every anchor to a live element in the preview", () => {
    expect(anchors.length).toBeGreaterThan(0)
    for (const a of anchors) {
      const href = a.getAttribute("href") ?? ""
      expect(lookup(pane, href), `dangling anchor ${href}`).not.toBeNull()
    }
  })

  it("finds ids containing a colon", () => {
    expect(lookup(pane, "#env-thm:main")).not.toBeNull()
  })

  it("lands on the target element, not on the referring paragraph", () => {
    const table = lookup(pane, "#tbl-decisiones")
    expect(table?.tagName).toBe("FIGURE")
    expect(table?.className).toBe("tbl-block")
    expect(table?.textContent).toContain("Perfilar el proyecto")

    const heading = lookup(pane, "#sec-decisiones")
    expect(heading?.tagName).toBe("H1")
  })

  it("sits inside an annotated block, so the anchor branch must take precedence", () => {
    // Guards the reported symptom: a reference written inside an environment
    // (or table cell) has a `data-source-line` ancestor, so without the anchor
    // branch running first the click falls through to the editor-jump fallback
    // and moves the editor to the *reference* instead of the target.
    const doc = `# Intro {#sec:intro}\n\n:::theorem[Main]\nVer @sec:intro.\n:::`
    const el = document.createElement("div")
    el.innerHTML = annotateSourceLines(renderMarkdown(doc), doc)

    const ref = el.querySelector('a[href="#sec-intro"]')
    expect(ref).not.toBeNull()
    expect(ref?.closest("[data-source-line]")).not.toBeNull()
    // ...and the anchor branch has a real target to land on instead.
    expect(lookup(el, "#sec-intro")?.tagName).toBe("H1")
  })
})
