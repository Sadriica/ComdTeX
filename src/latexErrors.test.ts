import { describe, expect, it } from "vitest"
import { formatDiagnosticsText, parseLatexStderr } from "./latexErrors"

describe("parseLatexStderr", () => {
  it("returns an empty array for an empty log", () => {
    expect(parseLatexStderr("")).toEqual([])
  })

  it("falls back to the first non-empty line when nothing matches a known pattern", () => {
    const stderr = "\nSome unrecognized tool output\nMore lines that are ignored\n"
    expect(parseLatexStderr(stderr)).toEqual([
      { severity: "error", message: "Some unrecognized tool output" },
    ])
  })

  it("parses 'Undefined control sequence' with a line/context lookahead", () => {
    const stderr = "! Undefined control sequence.\nl.10 \\foo\n         bar\n"
    const diags = parseLatexStderr(stderr)
    expect(diags).toHaveLength(1)
    expect(diags[0]).toEqual({
      severity: "error",
      message: "Undefined control sequence",
      line: 10,
      context: "\\foo",
      suggestion: "Unknown command \\foo — check spelling or define it in macros.md",
    })
  })

  it("parses 'Missing $ inserted' as an error with a math-mode suggestion", () => {
    const stderr = "! Missing $ inserted.\nl.15 $x\n"
    const diags = parseLatexStderr(stderr)
    expect(diags).toHaveLength(1)
    expect(diags[0]).toEqual({
      severity: "error",
      message: "Missing $ inserted.",
      line: 15,
      context: "$x",
      suggestion: "Math command used outside math mode. Wrap content in $...$ or $$...$$",
    })
  })

  it("parses 'Extra alignment tab' with a column-count suggestion", () => {
    const stderr = "! Extra alignment tab has been changed to \\cr."
    const diags = parseLatexStderr(stderr)
    expect(diags).toHaveLength(1)
    expect(diags[0].severity).toBe("error")
    expect(diags[0].message).toBe("Extra alignment tab has been changed to \\cr.")
    expect(diags[0].suggestion).toContain("& separators")
    expect(diags[0].line).toBeUndefined()
  })

  it("parses 'Runaway argument' with an unclosed-brace suggestion and line lookahead", () => {
    const stderr = "! Runaway argument?\nl.20 \\foo{bar\n"
    const diags = parseLatexStderr(stderr)
    expect(diags).toHaveLength(1)
    expect(diags[0].message).toBe("Runaway argument?")
    expect(diags[0].line).toBe(20)
    expect(diags[0].suggestion).toContain("Unclosed brace")
  })

  it("parses 'Missing }' the same as Runaway argument", () => {
    const stderr = "! Missing } inserted."
    const diags = parseLatexStderr(stderr)
    expect(diags[0].suggestion).toContain("Unclosed brace")
  })

  it("parses 'I can't find file' with a missing-package suggestion", () => {
    const stderr = "! I can't find file `myimage.png'."
    const diags = parseLatexStderr(stderr)
    expect(diags).toHaveLength(1)
    expect(diags[0].severity).toBe("error")
    expect(diags[0].message).toBe("I can't find file `myimage.png'.")
    expect(diags[0].suggestion).toBe(
      "Missing package file 'myimage.png'. With the built-in WASM engine this usually means the TeX package server is unreachable (offline or server down) — check your connection, set a mirror in Settings → PDF, or install tectonic for offline compiles. With a local toolchain, install the package or remove the \\usepackage command."
    )
  })

  it("parses 'Missing \\begin{document}'", () => {
    const stderr = "! Missing \\begin{document}."
    const diags = parseLatexStderr(stderr)
    expect(diags[0].suggestion).toContain("missing \\begin{document}")
  })

  it("parses a 'LaTeX Error: File ... not found' line (no line/context extracted)", () => {
    const stderr = "! LaTeX Error: File `foo.sty' not found."
    const diags = parseLatexStderr(stderr)
    expect(diags).toHaveLength(1)
    expect(diags[0]).toEqual({
      severity: "error",
      message: "File `foo.sty' not found.",
      suggestion: "Missing package file 'foo.sty'. With the built-in WASM engine this usually means the TeX package server is unreachable (offline or server down) — check your connection, set a mirror in Settings → PDF, or install tectonic for offline compiles. With a local toolchain, install the package or remove the \\usepackage command.",
    })
  })

  it("parses a 'LaTeX Error: Environment ... undefined' line", () => {
    const stderr = "! LaTeX Error: Environment tabular2 undefined."
    const diags = parseLatexStderr(stderr)
    expect(diags).toHaveLength(1)
    expect(diags[0].message).toBe("Environment tabular2 undefined.")
    expect(diags[0].suggestion).toBe(
      "Unknown environment 'tabular2'. Check spelling or add the required package."
    )
  })

  it("parses an Overfull hbox warning", () => {
    const stderr = "Overfull \\hbox (12.3pt too wide) in paragraph at lines 10--15"
    const diags = parseLatexStderr(stderr)
    expect(diags).toHaveLength(1)
    expect(diags[0]).toEqual({
      severity: "warning",
      message: "Line too wide (12.3pt overflow)",
      suggestion: "Add a line break, reduce font size, or use \\sloppy for this paragraph.",
    })
  })

  it("parses a LaTeX Font Warning", () => {
    const stderr = "LaTeX Font Warning: Font shape `OT1/cmr/m/n' undefined"
    const diags = parseLatexStderr(stderr)
    expect(diags).toHaveLength(1)
    expect(diags[0]).toEqual({
      severity: "warning",
      message: "Font shape `OT1/cmr/m/n' undefined",
    })
  })

  it("falls back to the first line even for a clean-looking compile log (no error/warning patterns matched)", () => {
    // Surprising real behavior: the fallback only checks whether *any* diagnostic
    // was parsed, not whether the log actually contains an error — so a clean
    // compile log with no matched patterns still produces a synthetic "error".
    const stderr = [
      "This is pdfTeX, Version 3.14159265-2.6-1.40.21",
      "entering extended mode",
      "Output written on main.pdf (1 page, 12345 bytes).",
      "Transcript written on main.log.",
    ].join("\n")
    expect(parseLatexStderr(stderr)).toEqual([
      { severity: "error", message: "This is pdfTeX, Version 3.14159265-2.6-1.40.21" },
    ])
  })

  it("returns an empty array when the log is only whitespace", () => {
    expect(parseLatexStderr("   \n\n   ")).toEqual([])
  })

  it("dedupes more than 3 identical diagnostics and annotates the 3rd", () => {
    const line = "! Undefined control sequence.\nfoo\n"
    const stderr = line.repeat(5)
    const diags = parseLatexStderr(stderr)
    // 5 identical errors -> only 3 kept, the 3rd annotated, the 5th silently dropped
    expect(diags).toHaveLength(3)
    expect(diags[0].message).toBe("Undefined control sequence.")
    expect(diags[1].message).toBe("Undefined control sequence.")
    expect(diags[2].message).toBe("Undefined control sequence. (and more similar)")
  })

  it("sorts errors before warnings regardless of source order", () => {
    const stderr = [
      "Overfull \\hbox (5.0pt too wide) in paragraph at lines 1--2",
      "! Missing $ inserted.",
      "l.5 x",
    ].join("\n")
    const diags = parseLatexStderr(stderr)
    expect(diags).toHaveLength(2)
    expect(diags[0].severity).toBe("error")
    expect(diags[1].severity).toBe("warning")
  })

  it("parses multiple distinct errors from a realistic multi-error log", () => {
    const stderr = [
      "! Undefined control sequence.",
      "l.3 \\foobar",
      "          test",
      "! LaTeX Error: File `missing.sty' not found.",
      "Overfull \\hbox (3.5pt too wide) in paragraph at lines 8--9",
    ].join("\n")
    const diags = parseLatexStderr(stderr)
    expect(diags).toHaveLength(3)
    const errors = diags.filter((d) => d.severity === "error")
    const warnings = diags.filter((d) => d.severity === "warning")
    expect(errors).toHaveLength(2)
    expect(warnings).toHaveLength(1)
    expect(errors.some((d) => d.message === "Undefined control sequence")).toBe(true)
    expect(errors.some((d) => d.message === "File `missing.sty' not found.")).toBe(true)
  })

  it("rejoins log lines hard-wrapped at the TeX 80-column limit", () => {
    // Real xelatex-via-pandoc output: the engine wraps at max_print_line
    // (default 79), so the message splits mid-word ("not lo" / "adable").
    const first = "! Font TU/lmr/m/n/10.95=[lmroman10-regular]:mapping=tex-text; at 10.95pt not lo"
    expect(first.length).toBe(79)
    const stderr = [first, "adable: Metric (TFM) file or installed font not found.", ""].join("\n")
    const diags = parseLatexStderr(stderr)
    expect(diags).toHaveLength(1)
    expect(diags[0].message).toContain("not loadable: Metric (TFM) file or installed font not found")
    expect(diags[0].message).not.toMatch(/not lo$/)
  })

  it("suggests installing the TeX fonts package on font-not-loadable errors", () => {
    const stderr = "! Font TU/lmr/m/n/10 not loadable: Metric (TFM) file or installed font not found."
    const diags = parseLatexStderr(stderr)
    expect(diags[0].severity).toBe("error")
    expect(diags[0].suggestion).toContain("texlive-fontsrecommended")
  })
})

describe("formatDiagnosticsText", () => {
  it("formats an empty list as an empty string", () => {
    expect(formatDiagnosticsText([])).toBe("")
  })

  it("formats error/warning labels, line numbers, context and suggestions", () => {
    const text = formatDiagnosticsText([
      {
        severity: "error",
        message: "Undefined control sequence",
        line: 10,
        context: "\\foo",
        suggestion: "Unknown command \\foo — check spelling or define it in macros.md",
      },
      {
        severity: "warning",
        message: "Line too wide (12.3pt overflow)",
      },
    ])
    expect(text).toBe(
      "Error (line 10): Undefined control sequence\n" +
        "  Context: \\foo\n" +
        "  → Unknown command \\foo — check spelling or define it in macros.md\n\n" +
        "Warning: Line too wide (12.3pt overflow)"
    )
  })

  it("omits the line/context/suggestion segments when absent", () => {
    const text = formatDiagnosticsText([{ severity: "error", message: "Something broke" }])
    expect(text).toBe("Error: Something broke")
  })
})
