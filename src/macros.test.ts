import { describe, expect, it } from "vitest"
import { MACROS_FILENAME, MACROS_TEMPLATE, parseMacros } from "./macros"

describe("parseMacros", () => {
  it("returns an empty object for empty input", () => {
    expect(parseMacros("")).toEqual({})
  })

  it("parses a simple zero-argument macro", () => {
    const macros = parseMacros("\\newcommand{\\R}{\\mathbb{R}}")
    expect(macros).toEqual({ "\\R": "\\mathbb{R}" })
  })

  it("parses a macro with a single argument, stripping the [1] arity marker", () => {
    const macros = parseMacros("\\newcommand{\\norm}[1]{\\left\\|#1\\right\\|}")
    expect(macros).toEqual({ "\\norm": "\\left\\|#1\\right\\|" })
  })

  it("parses a macro with two arguments (#1 and #2)", () => {
    const macros = parseMacros("\\newcommand{\\inner}[2]{\\langle #1,\\, #2 \\rangle}")
    expect(macros).toEqual({ "\\inner": "\\langle #1,\\, #2 \\rangle" })
  })

  it("parses a macro up to 9 arguments (#1..#9)", () => {
    const macros = parseMacros("\\newcommand{\\nine}[9]{#1#2#3#4#5#6#7#8#9}")
    expect(macros).toEqual({ "\\nine": "#1#2#3#4#5#6#7#8#9" })
  })

  it("ignores comment lines starting with %", () => {
    const macros = parseMacros("% this is a comment\n\\newcommand{\\R}{\\mathbb{R}}\n% \\newcommand{\\Q}{\\mathbb{Q}}")
    expect(macros).toEqual({ "\\R": "\\mathbb{R}" })
  })

  it("ignores blank/whitespace-only lines", () => {
    const macros = parseMacros("\n   \n\\newcommand{\\R}{\\mathbb{R}}\n\n\t\n")
    expect(macros).toEqual({ "\\R": "\\mathbb{R}" })
  })

  it("tolerates leading/trailing whitespace on a definition line", () => {
    const macros = parseMacros("   \\newcommand{\\R}{\\mathbb{R}}   ")
    expect(macros).toEqual({ "\\R": "\\mathbb{R}" })
  })

  it("does NOT support \\renewcommand (only literal \\newcommand is matched)", () => {
    // Surprising real behavior: the prefix regex only matches "\newcommand" at the
    // start of the trimmed line, so \renewcommand lines are silently skipped —
    // there is no special-case handling or fallback for renewcommand.
    const macros = parseMacros("\\renewcommand{\\R}{\\mathbb{Z}}")
    expect(macros).toEqual({})
  })

  it("does NOT support \\DeclareMathOperator", () => {
    const macros = parseMacros("\\DeclareMathOperator{\\Tr}{Tr}")
    expect(macros).toEqual({})
  })

  it("skips a malformed definition missing the body brace, without throwing", () => {
    expect(() => parseMacros("\\newcommand{\\foo}")).not.toThrow()
    expect(parseMacros("\\newcommand{\\foo}")).toEqual({})
  })

  it("skips a malformed definition with an unclosed name brace, without throwing", () => {
    expect(() => parseMacros("\\newcommand{\\foo{")).not.toThrow()
    expect(parseMacros("\\newcommand{\\foo{")).toEqual({})
  })

  it("skips a line that isn't a \\newcommand at all, without throwing", () => {
    const macros = parseMacros("just some prose about macros, not a definition")
    expect(macros).toEqual({})
  })

  it("skips \\newcommand with no name brace at all", () => {
    expect(parseMacros("\\newcommand")).toEqual({})
  })

  it("correctly balances nested literal braces inside the macro body", () => {
    const macros = parseMacros("\\newcommand{\\set}[2]{\\{#1 \\mid #2\\}}")
    expect(macros).toEqual({ "\\set": "\\{#1 \\mid #2\\}" })
  })

  it("later definitions of the same name overwrite earlier ones", () => {
    const macros = parseMacros(
      "\\newcommand{\\R}{\\mathbb{R}}\n\\newcommand{\\R}{\\mathbb{Q}}"
    )
    expect(macros).toEqual({ "\\R": "\\mathbb{Q}" })
  })

  it("parses multiple macros across lines, mixed with comments and blanks", () => {
    const text = [
      "% macros for real analysis",
      "\\newcommand{\\R}{\\mathbb{R}}",
      "",
      "\\newcommand{\\norm}[1]{\\left\\|#1\\right\\|}",
      "% end",
    ].join("\n")
    const macros = parseMacros(text)
    expect(macros).toEqual({
      "\\R": "\\mathbb{R}",
      "\\norm": "\\left\\|#1\\right\\|",
    })
  })

  it("parses the full bundled MACROS_TEMPLATE into the expected KatexMacros shape", () => {
    const macros = parseMacros(MACROS_TEMPLATE)
    expect(macros).toEqual({
      "\\R": "\\mathbb{R}",
      "\\N": "\\mathbb{N}",
      "\\Z": "\\mathbb{Z}",
      "\\Q": "\\mathbb{Q}",
      "\\C": "\\mathbb{C}",
      "\\norm": "\\left\\|#1\\right\\|",
      "\\abs": "\\left|#1\\right|",
      "\\inner": "\\langle #1,\\, #2 \\rangle",
    })
  })
})

describe("MACROS_FILENAME", () => {
  it("is macros.md", () => {
    expect(MACROS_FILENAME).toBe("macros.md")
  })
})
