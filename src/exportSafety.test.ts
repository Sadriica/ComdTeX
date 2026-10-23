import { describe, expect, it } from "vitest"
import {
  exportToTex,
  exportReveal,
  escTex,
  escHref,
  listingsLanguage,
  codeBlockToTex,
  splitSlides,
} from "./exporter"
import { lossyExportWarnings } from "./exportCompatibility"

describe("escTex", () => {
  it("escapes a backslash once, without re-escaping its own braces", () => {
    expect(escTex("a\\b")).toBe("a\\textbackslash{}b")
    expect(escTex("\\{x}")).toBe("\\textbackslash{}\\{x\\}")
  })
  it("escapes the other specials", () => {
    expect(escTex("& % $ # _ ~ ^")).toBe(
      "\\& \\% \\$ \\# \\_ \\textasciitilde{} \\textasciicircum{}",
    )
  })
})

describe("href escaping", () => {
  it("escapes characters hyperref chokes on", () => {
    expect(escHref("https://a.b/c?x=1&y=2#frag_1~u%20")).toBe(
      "https://a.b/c?x=1\\&y=2\\#frag\\_1\\~u\\%20",
    )
  })
  it("percent-encodes braces and backslashes so a url cannot inject", () => {
    expect(escHref("x}\\input{/etc/passwd}")).toBe("x\\%7D\\%5Cinput\\%7B/etc/passwd\\%7D")
  })
  it("is applied to markdown links", () => {
    const tex = exportToTex("[go](https://a.b/?q=1&r=2#top)", "", "t")
    expect(tex).toContain("\\href{https://a.b/?q=1\\&r=2\\#top}{go}")
  })
})

describe("fenced code", () => {
  it("only emits languages listings knows", () => {
    expect(listingsLanguage("python")).toBe("Python")
    expect(listingsLanguage("PY {.numberLines}")).toBe("Python")
    expect(listingsLanguage("json")).toBeNull()
    expect(listingsLanguage("mermaid")).toBeNull()
    expect(listingsLanguage("constructor")).toBeNull()
    const tex = exportToTex("```json\n{}\n```\n\n```py\nx = 1\n```", "", "t")
    expect(tex).not.toContain("language=json")
    expect(tex).toContain("\\begin{lstlisting}\n{}")
    expect(tex).toContain("\\begin{lstlisting}[language=Python]")
  })
  it("cannot be broken out of with the end delimiter", () => {
    const evil = "x\n\\end{lstlisting}\n\\input{/etc/passwd}\n"
    expect(codeBlockToTex(evil, "python").startsWith("\\begin{verbatim}")).toBe(true)
    const both = codeBlockToTex("\\end{lstlisting}\n\\end{verbatim}\n\\input{x}\n")
    expect(both.match(/\\end\{lstlisting\}/g)).toHaveLength(1)
    expect(both.match(/\\end\{verbatim\}/g)).toHaveLength(1)
    expect(both.trimEnd().endsWith("\\end{lstlisting}")).toBe(true)
  })
})

describe("reveal export", () => {
  it("splits on --- lines but not inside fenced code", () => {
    const body = "# A\n---\n```yaml\na: 1\n---\nb: 2\n```\n---\n# C"
    const slides = splitSlides(body)
    expect(slides).toHaveLength(3)
    expect(slides[1]).toContain("b: 2")
  })
  it("pins the reveal.js version", () => {
    expect(exportReveal("# a", "t")).toContain("unpkg.com/reveal.js@5.1.0/dist/reveal.js")
  })
})

describe("lossyExportWarnings", () => {
  it("returns unique warnings only", () => {
    expect(lossyExportWarnings("```mermaid\n```\n```mermaid\n```", "latex")).toHaveLength(1)
    expect(lossyExportWarnings("plain text", "latex")).toEqual([])
    expect(lossyExportWarnings("\\newcommand{\\a}{b}", "obsidian")).toHaveLength(1)
  })
})
