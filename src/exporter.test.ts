import { describe, expect, it } from "vitest"
import { exportToTex } from "./exporter"

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
