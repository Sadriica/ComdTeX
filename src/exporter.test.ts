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
