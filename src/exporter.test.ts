import { describe, expect, it } from "vitest"
import { exportToTex, exportReveal } from "./exporter"

describe("exportToTex", () => {
  it("uses frontmatter metadata without exporting raw YAML as document body", () => {
    const tex = exportToTex("---\ntitle: Front Title\nauthor: Ada\n---\n# Body", "", "Front Title", "Ada")

    expect(tex).toContain("\\title{Front Title}")
    expect(tex).toContain("\\author{Ada}")
    expect(tex).toContain("\\section{Body}")
    expect(tex).not.toContain("title: Front Title")
    expect(tex).not.toContain("\\hrulefill")
  })

  it("exports structural labels and references as Overleaf-compatible LaTeX", () => {
    const tex = exportToTex([
      "# Intro {#sec:intro}",
      "Ver @sec:intro y @eq:energy.",
      "$$E = mc^2$$ {#eq:energy}",
      "![Diagrama](diagram.png){#fig:diagram}",
      "Ver @fig:diagram.",
      "| A | B |",
      "|---|---|",
      "| 1 | 2 |",
      "{#tbl:data}",
      "Ver @tbl:data.",
      ":::theorem[Principal]{#thm:main}",
      "Contenido",
      ":::",
      "Ver @thm:main.",
    ].join("\n"))

    expect(tex).toContain("\\label{sec:intro}")
    expect(tex).toContain("\\eqref{eq:energy}")
    expect(tex).toContain("\\label{eq:energy}")
    expect(tex).toContain("\\label{fig:diagram}")
    expect(tex).toContain("\\label{tbl:data}")
    expect(tex).toContain("\\label{thm:main}")
    expect(tex).toContain("Teorema~\\ref{thm:main}")
  })
})

describe("exportReveal", () => {
  it("defaults to the black theme when no frontmatter is present", () => {
    const html = exportReveal("# Slide", "Demo")
    expect(html).toContain("theme/black.css")
  })

  it("reads `reveal_theme` from frontmatter", () => {
    const html = exportReveal("---\nreveal_theme: dracula\n---\n# Slide", "Demo")
    expect(html).toContain("theme/dracula.css")
    expect(html).not.toContain("theme/black.css")
    // Frontmatter must not leak into the slide body
    expect(html).not.toContain("reveal_theme: dracula")
  })

  it("falls back to `theme` field if `reveal_theme` is missing", () => {
    const html = exportReveal("---\ntheme: solarized\n---\n# Slide", "Demo")
    expect(html).toContain("theme/solarized.css")
  })

  it("ignores invalid theme names and falls back to black", () => {
    const html = exportReveal("---\nreveal_theme: not-a-theme\n---\n# Slide", "Demo")
    expect(html).toContain("theme/black.css")
  })
})

describe("cross-file environment refs → LaTeX", () => {
  it("degrades a cross-file ref to plain text naming the source doc", () => {
    const tex = exportToTex("Como vimos en @gp/calendario@def:valor, esto vale.")
    expect(tex).toContain("Definición~(gp/calendario)")
    // The whole point: NO dangling \ref to a label that isn't in this document.
    expect(tex).not.toContain("\\ref{def:valor}")
    // And the path must not survive as stray escaped prose.
    expect(tex).not.toContain("@gp/calendario")
  })

  it("handles the bracketed escape form", () => {
    const tex = exportToTex("Ver @[mi carpeta/mi nota]@lem:clave aqui.")
    expect(tex).toContain("Lema~(mi carpeta/mi nota)")
    expect(tex).not.toContain("\\ref{lem:clave}")
  })

  it("still emits a real \\ref for LOCAL env refs", () => {
    const tex = exportToTex(":::theorem{#thm:main}\nx\n:::\n\nVer @thm:main")
    expect(tex).toContain("Teorema~\\ref{thm:main}")
  })

  it("leaves an unknown cross-file prefix as literal text", () => {
    const tex = exportToTex("@gp/calendario@zzz:valor")
    expect(tex).toContain("zzz:valor")
    expect(tex).not.toContain("\\ref{zzz:valor}")
  })
})
