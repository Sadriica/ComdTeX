import { describe, expect, it } from "vitest"
import { prescanFigures, resolveFigRefs } from "./figures"
import { renderMarkdown } from "./renderer"

function ids(html: string): string[] {
  return [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])
}

function fragmentHrefs(html: string): string[] {
  return [...html.matchAll(/\shref="#([^"]+)"/g)].map((m) => m[1])
}

describe("figure anchors", () => {
  it("prescans labels with the fig: prefix", () => {
    expect(prescanFigures("![Cap](a.png){#fig:map}").get("fig:map")).toBe(1)
  })

  it("emits a ref href that matches the figure id", () => {
    const html = renderMarkdown("![Cap](a.png){#fig:map}\n\nVer @fig:map")
    expect(html).toContain('id="fig-map"')
    expect(fragmentHrefs(html)).toContain("fig-map")
    for (const href of fragmentHrefs(html)) expect(ids(html)).toContain(href)
  })

  it("does not leak the label smuggling attribute into the output", () => {
    const html = renderMarkdown("![Cap](a.png){#fig:map}")
    expect(html).not.toContain("fig-label:")
    expect(html).not.toContain("{#fig:")
  })

  it("numbers labeled and unlabeled figures in document order", () => {
    const html = renderMarkdown("![One](a.png)\n\n![Two](b.png){#fig:two}\n\nVer @fig:two")
    expect(html).toContain('href="#fig-two">Figura 2</a>')
    expect(html).toContain('id="fig-two"')
  })

  it("falls back to positional ids for unlabeled figures", () => {
    expect(renderMarkdown("![One](a.png)")).toContain('id="fig-1"')
  })

  it("resolves numeric refs to the positional anchor", () => {
    expect(resolveFigRefs("@fig:1", new Map())).toContain('href="#fig-1"')
  })

  it("marks unknown labels as broken rather than linking nowhere", () => {
    expect(resolveFigRefs("@fig:ghost", new Map())).toContain("fig-ref-broken")
  })
})
