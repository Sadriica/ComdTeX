import { describe, it, expect } from "vitest"
import { analyzeConversion, isCmdxFormat, parseCmdxDocument, toCmdx, toStorage, detectStorageFormat, toDiskContent, toEditorContent } from "./cmdxFormat"

describe("cmdxFormat", () => {
  describe("isCmdxFormat", () => {
    it("detects CMDX environment", () => {
      expect(isCmdxFormat(":::theorem\nContent\n:::")).toBe(true)
    })

    it("detects CMDX shorthand", () => {
      expect(isCmdxFormat("table(A, B)")).toBe(true)
      expect(isCmdxFormat("mat(1, 2, 3)")).toBe(true)
    })

    it("detects regular .md as not CMDX", () => {
      expect(isCmdxFormat("# Title\n\nSome content")).toBe(false)
      expect(isCmdxFormat("> [!note] Note")).toBe(false)
    })
  })

  describe("toCmdx - Markdown to CMDX", () => {
    it("converts Obsidian callout to CMDX env", () => {
      const input = "> [!note] This is a note"
      const output = toCmdx(input, "md")
      expect(output).toContain(":::note")
    })

    it("preserves existing CMDX content", () => {
      const input = ":::theorem[Title]\nContent\n:::"
      const output = toCmdx(input, "md")
      expect(output).toContain(":::theorem")
    })

    it("leaves regular markdown unchanged", () => {
      const input = "# Heading\n\nSome paragraph."
      const output = toCmdx(input, "md")
      expect(output).toContain("# Heading")
      expect(output).toContain("Some paragraph")
    })
  })

  describe("toStorage - CMDX to Markdown", () => {
    it("converts CMDX env to Obsidian callout", () => {
      const input = ":::note\nContent\n:::"
      const output = toStorage(input, "md")
      expect(output).toContain("> [!note]")
    })

    it("converts lemma callout", () => {
      const input = ":::lemma\nLemma\n:::"
      const output = toStorage(input, "md")
      expect(output).toContain("> [!abstract]")
    })

    it("keeps environment type recoverable through Obsidian titles", () => {
      const input = ":::theorem[Custom]\nBody\n:::"
      const stored = toStorage(input, "md")
      expect(stored).toContain("> [!abstract] Theorem: Custom")
      expect(toCmdx(stored, "md")).toContain(":::theorem[Custom]\nBody\n:::")
    })

    it("preserves labels", () => {
      const input = "$$x^2$$ {#eq:foo}"
      const output = toStorage(input, "md")
      expect(output).toContain("{#eq:foo}")
    })

    it("preserves regular markdown", () => {
      const input = "# Heading\n\nContent"
      const output = toStorage(input, "md")
      expect(output).toContain("# Heading")
    })

    it("keeps tables inside converted callouts", () => {
      const input = ":::note\nBefore\ntable(A, B)\nAfter\n:::"
      const output = toStorage(input, "md")
      expect(output).toContain("> Before\n> | A | B |\n> | --- | --- |\n> After")
    })
  })

  describe("toStorageTex - CMDX to LaTeX", () => {
    it("converts mat() to bmatrix", () => {
      const input = "mat(1, 2, 3, 4)"
      const output = toStorage(input, "tex")
      expect(output).toContain("\\begin{bmatrix}")
    })

    it("converts frac() to LaTeX", () => {
      const input = "frac(a, b)"
      const output = toStorage(input, "tex")
      expect(output).toContain("\\frac{")
    })

    it("converts nested shorthands with balanced arguments", () => {
      const input = "frac(sqrt(x), norm(vec(v)))"
      const output = toStorage(input, "tex")
      expect(output).toBe("\\frac{\\sqrt{x}}{\\left\\|\\vec{v}\\right\\|}")
    })

    it("preserves environment titles and labels", () => {
      const input = ":::theorem[Title] {#thm:one}\nContent\n:::"
      const output = toStorage(input, "tex")
      expect(output).toContain("\\begin{theorem}[Title]")
      expect(output).toContain("\\label{thm:one}")
      expect(output).toContain("\\end{theorem}")
    })

    it("preserves structural labels instead of dropping them", () => {
      expect(toStorage("# Intro {#sec:intro}", "tex")).toContain("\\label{sec:intro}")
      expect(toStorage("![Alt](fig.png) {#fig:f}", "tex")).toContain("\\label{fig:f}")
      expect(toStorage("{#tbl:t}", "tex")).toContain("\\label{tbl:t}")
    })
  })

  describe("toCmdxTex - LaTeX to CMDX", () => {
    it("preserves equation content", () => {
      const input = "\\begin{equation}x^2\\end{equation}"
      const output = toCmdx(input, "tex")
      expect(output).toContain("\\begin{equation}")
      expect(output).toContain("x^2")
      expect(output).toContain("\\end{equation}")
    })

    it("converts matrices before generic environments", () => {
      const input = "\\begin{bmatrix}1 & 2 \\\\ 3 & 4\\end{bmatrix}"
      expect(toCmdx(input, "tex")).toBe("mat(1, 2, 3, 4)")
    })

    it("converts LaTeX theorem title and label", () => {
      const input = "\\begin{theorem}[Title]\\label{thm:one}\nContent\n\\end{theorem}"
      const output = toCmdx(input, "tex")
      expect(output).toContain(":::theorem[Title] {#thm:one}")
      expect(output).toContain("Content")
    })
  })

  describe("round-trip and edge cases", () => {
    it("handles mixed Markdown callouts and existing CMDX", () => {
      const input = ":::note\nExisting\n:::\n\n> [!warning] Careful\n> Body"
      const output = toCmdx(input, "md")
      expect(output).toContain(":::note\nExisting\n:::")
      expect(output).toContain(":::warning[Careful]\nBody\n:::")
    })

    it("does not strip normal blockquotes", () => {
      const input = "> quoted text"
      expect(toCmdx(input, "md")).toBe(input)
    })

    it("preserves frontmatter while converting the body", () => {
      const input = "---\ntitle: X\n---\n> [!note] Title\n> Body"
      const output = toCmdx(input, "md")
      expect(output.startsWith("---\ntitle: X\n---\n")).toBe(true)
      expect(output).toContain(":::note[Title]\nBody\n:::")
    })

    it("uses path helpers as the only storage gateway", () => {
      expect(toEditorContent("note.md", "> [!note] Hi")).toBe(":::note[Hi]\n:::")
      expect(toDiskContent("note.md", ":::note\nHi\n:::")).toContain("> [!note]")
      expect(toEditorContent("refs.bib", "table(A, B)")).toBe("table(A, B)")
      expect(toDiskContent("refs.bib", "table(A, B)")).toBe("table(A, B)")
    })
  })

  describe("detectStorageFormat", () => {
    it("detects .tex by extension", () => {
      expect(detectStorageFormat("file.tex")).toBe("tex")
      expect(detectStorageFormat("file.md")).toBe("md")
    })

    it("defaults to md", () => {
      expect(detectStorageFormat("file.txt")).toBe("md")
    })
  })

  describe("analyzeConversion", () => {
    it("warns about unclosed CMDX environments and unbalanced shorthands", () => {
      const report = analyzeConversion(":::note\nfrac(a, b", "md")
      expect(report.warnings.map((w) => w.code)).toContain("unclosed-cmdx-environment")
      expect(report.warnings.map((w) => w.code)).toContain("unbalanced-shorthand")
    })

    it("warns about preserved LaTeX constructs that CMDX does not interpret", () => {
      const report = analyzeConversion("\\documentclass{article}\n\\newcommand{\\R}{\\mathbb{R}}\n\\begin{tikzpicture}\n\\end{tikzpicture}", "tex")
      expect(report.warnings.map((w) => w.code)).toContain("latex-preamble-preserved")
      expect(report.warnings.map((w) => w.code)).toContain("custom-latex-macro-preserved")
      expect(report.warnings.map((w) => w.code)).toContain("unsupported-latex-environment")
    })

    it("warns when size prefixes are used in md storage (lossy conversion)", () => {
      const report = analyzeConversion(":::sm theorem[Title]\nBody\n:::", "md")
      expect(report.warnings.map((w) => w.code)).toContain("size-prefix-dropped")
    })

    it("does not warn about size prefixes for tex storage", () => {
      const report = analyzeConversion(":::sm theorem[Title]\nBody\n:::", "tex")
      expect(report.warnings.map((w) => w.code)).not.toContain("size-prefix-dropped")
    })
  })

  describe("parseCmdxDocument", () => {
    it("parses text and nested environments into an AST", () => {
      const ast = parseCmdxDocument([
        "# Intro",
        ":::theorem[Main] {#thm:main}",
        "Body",
        ":::proof",
        "Done",
        ":::",
        ":::",
      ].join("\n"))

      expect(ast[0]).toMatchObject({ type: "text", content: "# Intro" })
      expect(ast[1]).toMatchObject({ type: "environment", name: "theorem", title: "Main", label: "thm:main" })
      if (ast[1].type !== "environment") throw new Error("expected environment")
      expect(ast[1].children[0]).toMatchObject({ type: "text", content: "Body" })
      expect(ast[1].children[1]).toMatchObject({ type: "environment", name: "proof" })
    })
  })
})
