// @vitest-environment jsdom
// The preview shows tracked changes; every other consumer gets them accepted.
import { beforeEach, describe, expect, it } from "vitest"
import { renderMarkdown } from "./renderer"
import { sanitizeRenderedHtml } from "./sanitizeRenderedHtml"
import { exportToTex, exportReveal } from "./exporter"
import { resolveDocumentContent } from "./documentResolve"
import { setUiLanguage } from "./docLang"
import { toPandocMarkdownInput } from "./exportConversion"

const show = (md: string) =>
  renderMarkdown(md, {}, undefined, undefined, undefined, undefined, undefined, {
    showChanges: true,
    annotate: false,
  })

beforeEach(() => setUiLanguage("en"))

describe("preview rendering", () => {
  it("renders additions, deletions, substitutions and highlights", () => {
    const html = show("A {++added++} and {--removed--} and {~~old~>new~~} and {==key==}.")
    expect(html).toContain('<ins class="critic critic-add"')
    expect(html).toContain(">added</ins>")
    expect(html).toContain('<del class="critic critic-del"')
    expect(html).toContain(">old</del>")
    expect(html).toContain(">new</ins>")
    expect(html).toContain('<mark class="critic critic-highlight"')
  })

  it("still renders math inside a mark", () => {
    const html = show("See {++the bound $\\alpha^2$ and\n\n$$\\beta+1$$\n\nend++}.")
    expect(html).toContain("katex")
    expect(html).not.toContain("{++")
    expect(html).not.toContain("++}")
    expect(html).not.toContain("$\\alpha")
  })

  it("never renders a mark inside math or code", () => {
    const html = show("Formula $a {++b++} c$ and `{--x--}`.")
    expect(html).not.toContain("critic-add")
    expect(html).not.toContain("critic-del")
    expect(html).toContain("{--x--}")
  })

  it("renders a comment as a labelled, focusable marker with its text", () => {
    const html = show('Text{>>Check $5 & the "cite"<<} more.')
    expect(html).toContain('class="critic critic-comment"')
    expect(html).toContain('tabindex="0"')
    expect(html).toContain("aria-label=")
    const clean = sanitizeRenderedHtml(html)
    expect(clean).toContain("data-comment=")
    expect(clean).toContain('tabindex="0"')
    const dom = new DOMParser().parseFromString(clean, "text/html")
    expect(dom.querySelector(".critic-comment")!.getAttribute("data-comment")).toBe(
      'Check $5 & the "cite"',
    )
  })

  it("survives the sanitizer and keeps the classes", () => {
    const clean = sanitizeRenderedHtml(show("{++a++}{--b--}"))
    expect(clean).toContain("critic-add")
    expect(clean).toContain("critic-del")
  })

  it("localizes the accessible names", () => {
    setUiLanguage("es")
    expect(show("{++a++}")).toContain('title="Añadido"')
  })
})

describe("every other renderer caller gets accepted text", () => {
  const src = "Keep {++this++} but not {--that--} or {~~old~>new~~}{>>note<<}."
  it("renderMarkdown without showChanges", () => {
    const html = renderMarkdown(src, {})
    expect(html).toContain("Keep this but not  or new.")
    expect(html).not.toContain("critic")
  })
})

describe("export accepts all changes in the copy", () => {
  const src = "# T\n\nWe {++prove $x^2$++} and {--drop--} {~~a~>b~~}{>>c<<}.\n"
  it("resolveDocumentContent", () => {
    expect(resolveDocumentContent(src)).toBe("# T\n\nWe prove $x^2$ and  b.\n")
    expect(resolveDocumentContent(src, undefined, { keepChanges: true })).toBe(src)
    // an embedded note is accepted too
    const out = resolveDocumentContent("![[n]]", (t) => (t === "n" ? "x {--y--}z" : null))
    expect(out).toContain("x z")
    expect(out).not.toContain("{--")
  })
  it("LaTeX", () => {
    const tex = exportToTex(src, "", "t")
    expect(tex).toContain("prove $x^2$")
    expect(tex).not.toMatch(/\{\+\+|\+\+\}|\{--|--\}|\{~~|\{>>/)
    expect(tex).not.toContain("drop")
  })
  it("Pandoc input (DOCX, Typst, Beamer, PDF)", () => {
    const md = toPandocMarkdownInput(src)
    expect(md).toContain("prove $x^2$")
    expect(md).not.toContain("drop")
    expect(md).not.toMatch(/\{\+\+|\{--|\{~~|\{>>/)
  })
  it("Reveal.js", () => {
    const html = exportReveal("# S\n\nA {--gone--}{++kept++}\n", "t")
    expect(html).toContain("kept")
    expect(html).not.toContain("gone")
    expect(html).not.toContain("{++")
  })
})
