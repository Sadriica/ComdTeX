import { describe, expect, it } from "vitest"
import { exportToTex } from "./exporter"

describe("exportToTex document language", () => {
  const body = "See @fig:a, @tbl:b, @sec:c and @thm:t.\n\n:::theorem{#thm:t}\nX\n:::\n"

  it("exports an English document with English names and babel", () => {
    const tex = exportToTex(`---\nlang: en\n---\n${body}`, "", "t")
    expect(tex).toContain("\\usepackage[english]{babel}")
    expect(tex).not.toContain("es-noquoting")
    expect(tex).toContain("\\newtheorem{theorem}{Theorem}")
    expect(tex).toContain("\\newtheorem*{definition}{Definition}")
    expect(tex).toContain("Figure~\\ref{fig:a}")
    expect(tex).toContain("Table~\\ref{tbl:b}")
    expect(tex).toContain("Section~\\ref{sec:c}")
    expect(tex).toContain("Theorem~\\ref{thm:t}")
    expect(tex).not.toContain("Teorema")
  })

  it("keeps the Spanish output for a Spanish document", () => {
    const tex = exportToTex(`---\nlang: es\n---\n${body}`, "", "t")
    expect(tex).toContain("\\usepackage[spanish,es-noquoting,es-noshorthands]{babel}")
    expect(tex).toContain("\\newtheorem{theorem}{Teorema}")
    expect(tex).toContain("Figura~\\ref{fig:a}")
    expect(tex).toContain("Tabla~\\ref{tbl:b}")
    expect(tex).toContain("sección~\\ref{sec:c}")
  })

  it("names cross-file refs in the document language", () => {
    const tex = exportToTex("---\nlang: en\n---\nSee @gp/cal@def:x.\n", "", "t")
    expect(tex).toContain("Definition~(gp/cal)")
  })

  it("gives journal-class English documents English theorem names", () => {
    const tex = exportToTex("---\nlang: en\ncomdtex.texclass: acmart\n---\nHi\n", "", "t")
    expect(tex).toContain("\\newtheorem*{exercise}{Exercise}")
    expect(tex).toContain("\\newtheorem*{remark}{Remark}")
    const ieee = exportToTex("---\nlang: en\ncomdtex.texclass: ieeetran\n---\nHi\n", "", "t")
    expect(ieee).toContain("\\newtheorem{lemma}[theorem]{Lemma}")
  })

  it("labels the user macros block in English", () => {
    const tex = exportToTex("Hi", "\\newcommand{\\R}{\\mathbb{R}}", "t")
    expect(tex).toContain("% User macros")
  })
})
