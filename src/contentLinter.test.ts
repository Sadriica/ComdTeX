import { describe, it, expect } from "vitest"
import { lintContent, lintFile, lintFileSummary, type LintContext } from "./contentLinter"

// Stub for monaco MarkerSeverity enum
const Severity = { Error: 8, Warning: 4, Info: 2, Hint: 1 } as const
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MarkerSeverity = Severity as any

const emptyCtx: LintContext = { vaultFileNames: new Set(), bibKeys: new Set() }

function lint(text: string, ctx: LintContext = emptyCtx) {
  return lintContent(text, ctx, MarkerSeverity)
}

function lintBib(text: string) {
  return lintFile(text, "references.bib", emptyCtx, MarkerSeverity)
}

function lintMac(text: string) {
  return lintFile(text, "macros.md", emptyCtx, MarkerSeverity)
}

// ── Display math ──────────────────────────────────────────────────────────────

describe("lintDisplayMath", () => {
  it("no error when $$ are balanced", () => {
    const markers = lint("$$x^2$$")
    expect(markers.filter(m => m.message.includes("$$"))).toHaveLength(0)
  })

  it("error on unclosed $$", () => {
    const markers = lint("$$x^2")
    const err = markers.find(m => m.message.includes("$$"))
    expect(err).toBeDefined()
    expect(err!.severity).toBe(Severity.Error)
  })

  it("no false positive for multiple balanced $$", () => {
    const text = "$$a$$\n\nSome text.\n\n$$b$$"
    expect(lint(text).filter(m => m.message.includes("$$"))).toHaveLength(0)
  })

  it("ignores $$ inside fenced code blocks", () => {
    const text = "```\n$$unclosed\n```"
    expect(lint(text).filter(m => m.message.includes("$$"))).toHaveLength(0)
  })
})

// ── Environments ──────────────────────────────────────────────────────────────

describe("lintEnvironments", () => {
  it("no error on balanced :::theorem", () => {
    const text = ":::theorem\nContent\n:::"
    expect(lint(text).filter(m => m.message.includes(":::"))).toHaveLength(0)
  })

  it("error on unclosed :::theorem", () => {
    const markers = lint(":::theorem\nContent")
    const err = markers.find(m => m.message.includes(":::theorem"))
    expect(err).toBeDefined()
    expect(err!.severity).toBe(Severity.Error)
  })

  it("error on orphan closing :::", () => {
    const markers = lint(":::")
    const err = markers.find(m => m.message.includes("sin entorno"))
    expect(err).toBeDefined()
  })

  it("handles nested environments", () => {
    const text = ":::theorem\n:::example\nInner\n:::\n:::"
    expect(lint(text).filter(m => m.message.includes(":::"))).toHaveLength(0)
  })

  it("reports unclosed outer env when inner is closed but outer is not", () => {
    const text = ":::theorem\n:::example\nInner\n:::"
    const markers = lint(text).filter(m => m.message.includes(":::"))
    expect(markers.length).toBeGreaterThan(0)
  })

  it("env with title: :::theorem[Título]", () => {
    const text = ":::theorem[Teorema principal]\nContent\n:::"
    expect(lint(text).filter(m => m.message.includes(":::"))).toHaveLength(0)
  })
})

// ── Equation references ───────────────────────────────────────────────────────

describe("lintEqRefs", () => {
  it("no warning when ref matches a label", () => {
    const text = "$$x$$ {#eq:foo}\nSee @eq:foo."
    expect(lint(text).filter(m => m.message.includes("@eq:"))).toHaveLength(0)
  })

  it("warning on undefined ref", () => {
    const markers = lint("See @eq:missing.")
    const w = markers.find(m => m.message.includes("@eq:missing"))
    expect(w).toBeDefined()
    expect(w!.severity).toBe(Severity.Warning)
  })

  it("numeric refs like @eq:1 are always valid", () => {
    expect(lint("See @eq:1.").filter(m => m.message.includes("@eq:"))).toHaveLength(0)
  })

  it("reports correct position of broken ref", () => {
    const text = "abc @eq:broken xyz"
    const markers = lint(text).filter(m => m.message.includes("@eq:broken"))
    expect(markers).toHaveLength(1)
    expect(markers[0].startColumn).toBe(5) // 'abc ' = 4 chars, 1-based → col 5
  })
})

// ── Wikilinks ─────────────────────────────────────────────────────────────────

describe("lintWikilinks", () => {
  it("no warning when vault is empty (not loaded)", () => {
    expect(lint("[[missing-note]]", emptyCtx)).toHaveLength(0)
  })

  it("no warning for existing wikilink", () => {
    const ctx: LintContext = { vaultFileNames: new Set(["my-note"]), bibKeys: new Set() }
    expect(lint("[[my-note]]", ctx).filter(m => m.message.includes("Wikilink"))).toHaveLength(0)
  })

  it("warning for missing wikilink", () => {
    const ctx: LintContext = { vaultFileNames: new Set(["exists"]), bibKeys: new Set() }
    const markers = lint("[[not-here]]", ctx).filter(m => m.message.includes("Wikilink"))
    expect(markers).toHaveLength(1)
    expect(markers[0].severity).toBe(Severity.Warning)
  })

  it("wikilink matching is case-insensitive", () => {
    const ctx: LintContext = { vaultFileNames: new Set(["my note"]), bibKeys: new Set() }
    expect(lint("[[My Note]]", ctx).filter(m => m.message.includes("Wikilink"))).toHaveLength(0)
  })

  it("wikilinks with pipe alias: [[target|label]]", () => {
    const ctx: LintContext = { vaultFileNames: new Set(["target"]), bibKeys: new Set() }
    expect(lint("[[target|display label]]", ctx).filter(m => m.message.includes("Wikilink"))).toHaveLength(0)
  })
})

// ── Citations ─────────────────────────────────────────────────────────────────

describe("lintCitations", () => {
  it("no warning when bib is empty (not loaded)", () => {
    expect(lint("[@missing]", emptyCtx)).toHaveLength(0)
  })

  it("no warning for defined citation key", () => {
    const ctx: LintContext = { vaultFileNames: new Set(), bibKeys: new Set(["knuth84"]) }
    expect(lint("[@knuth84]", ctx).filter(m => m.message.includes("Cita"))).toHaveLength(0)
  })

  it("warning for undefined citation key", () => {
    const ctx: LintContext = { vaultFileNames: new Set(), bibKeys: new Set(["knuth84"]) }
    const markers = lint("[@unknown]", ctx).filter(m => m.message.includes("Cita"))
    expect(markers).toHaveLength(1)
    expect(markers[0].severity).toBe(Severity.Warning)
  })

  it("citation with page number: [@key, p. 42]", () => {
    const ctx: LintContext = { vaultFileNames: new Set(), bibKeys: new Set(["ref"]) }
    expect(lint("[@ref, p. 42]", ctx).filter(m => m.message.includes("Cita"))).toHaveLength(0)
  })
})

// ── Shorthands ────────────────────────────────────────────────────────────────

describe("lintShorthands", () => {
  it("no error for correct frac(a, b)", () => {
    expect(lint("frac(a, b)").filter(m => m.message.includes("frac"))).toHaveLength(0)
  })

  it("error on unclosed paren: frac(a, b", () => {
    const markers = lint("frac(a, b").filter(m => m.message.includes("frac"))
    expect(markers).toHaveLength(1)
    expect(markers[0].severity).toBe(Severity.Error)
  })

  it("warning when arg count is wrong: frac(a) → expects 2", () => {
    const markers = lint("frac(a)").filter(m => m.message.includes("frac"))
    expect(markers).toHaveLength(1)
    expect(markers[0].severity).toBe(Severity.Warning)
    expect(markers[0].message).toContain("2 argumentos")
    expect(markers[0].message).toContain("recibió 1")
  })

  it("warning when too many args: sqrt(x, y) → expects 1", () => {
    const markers = lint("sqrt(x, y)").filter(m => m.message.includes("sqrt"))
    expect(markers).toHaveLength(1)
    expect(markers[0].message).toContain("1 argumento")
  })

  it("no error for variadic mat()", () => {
    expect(lint("mat(1, 0, 0, 1)").filter(m => m.message.includes("mat"))).toHaveLength(0)
  })

  it("ignores \\frac( (LaTeX command, not a shorthand)", () => {
    expect(lint("$\\frac(a, b)$").filter(m => m.message.includes("frac"))).toHaveLength(0)
  })

  it("no false positive for empty shorthand call: frac()", () => {
    expect(lint("frac()").filter(m => m.message.includes("argumentos"))).toHaveLength(0)
  })
})

// ── Code stripping ────────────────────────────────────────────────────────────

describe("code block stripping", () => {
  it("does not flag unclosed $$ inside fenced code", () => {
    const text = "```\n$$unclosed\n```\nNormal text."
    expect(lint(text).filter(m => m.severity === Severity.Error)).toHaveLength(0)
  })

  it("does not flag shorthands inside inline code", () => {
    const text = "Use `frac(a,` to type fractions."
    expect(lint(text).filter(m => m.message.includes("Paréntesis"))).toHaveLength(0)
  })
})

// ── BibTeX linter ─────────────────────────────────────────────────────────────

describe("lintBibtex", () => {
  it("no errors for a valid article entry", () => {
    const bib = `@article{euler1748,
  author  = {Euler, L.},
  title   = {Introductio},
  journal = {Lausanne},
  year    = {1748},
}`
    expect(lintBib(bib)).toHaveLength(0)
  })

  it("no errors for a valid book entry", () => {
    const bib = `@book{knuth84,
  author    = {Knuth, D.},
  title     = {The TeXbook},
  publisher = {AW},
  year      = {1984},
}`
    expect(lintBib(bib)).toHaveLength(0)
  })

  it("warning for unknown entry type", () => {
    const bib = `@webpage{mysite,
  author = {Me},
  title  = {My Site},
  year   = {2020},
}`
    const markers = lintBib(bib)
    expect(markers.some(m => m.message.includes("desconocido") && m.severity === Severity.Warning)).toBe(true)
  })

  it("error for duplicate citation key", () => {
    const bib = `@article{dup,
  author = {A}, title = {B}, journal = {C}, year = {2020},
}
@book{dup,
  author = {A}, title = {B}, publisher = {C}, year = {2020},
}`
    const markers = lintBib(bib)
    expect(markers.some(m => m.message.includes("duplicada") && m.severity === Severity.Error)).toBe(true)
  })

  it("duplicate key check is case-insensitive", () => {
    const bib = `@article{Foo,
  author = {A}, title = {B}, journal = {C}, year = {2020},
}
@article{foo,
  author = {A}, title = {B}, journal = {C}, year = {2020},
}`
    const markers = lintBib(bib)
    expect(markers.some(m => m.message.includes("duplicada"))).toBe(true)
  })

  it("warning for missing required field in article (no journal)", () => {
    const bib = `@article{nojournal,
  author = {A},
  title  = {B},
  year   = {2020},
}`
    const markers = lintBib(bib)
    expect(markers.some(m => m.message.includes("journal") && m.severity === Severity.Warning)).toBe(true)
  })

  it("warning for missing required field in book (no publisher)", () => {
    const bib = `@book{nopub,
  author = {A},
  title  = {B},
  year   = {2020},
}`
    const markers = lintBib(bib)
    expect(markers.some(m => m.message.includes("publisher") && m.severity === Severity.Warning)).toBe(true)
  })

  it("book accepts editor instead of author", () => {
    const bib = `@book{edited,
  editor    = {E.},
  title     = {Handbook},
  publisher = {Press},
  year      = {2000},
}`
    // Should NOT warn about author/editor
    const markers = lintBib(bib)
    expect(markers.some(m => m.message.includes("author") || m.message.includes("editor"))).toBe(false)
  })

  it("error for unclosed entry brace", () => {
    const bib = "@article{unclosed,\n  author = {A},\n  title = {B},"
    const markers = lintBib(bib)
    expect(markers.some(m => m.message.includes("sin cerrar") && m.severity === Severity.Error)).toBe(true)
  })

  it("ignores @string and @comment entries", () => {
    const bib = `@string{pub = {MIT Press}}
@comment{This is ignored}
@article{ok,
  author = {A}, title = {B}, journal = {C}, year = {2020},
}`
    expect(lintBib(bib)).toHaveLength(0)
  })

  it("misc entry has no required fields", () => {
    const bib = `@misc{mymisc,
  note = {Something},
}`
    expect(lintBib(bib)).toHaveLength(0)
  })

  it("multiple valid entries produce no markers", () => {
    const bib = `@article{a1,
  author = {A}, title = {T1}, journal = {J}, year = {2020},
}
@book{b1,
  author = {B}, title = {T2}, publisher = {P}, year = {2021},
}`
    expect(lintBib(bib)).toHaveLength(0)
  })
})

// ── Macros linter ─────────────────────────────────────────────────────────────

describe("lintMacros", () => {
  it("no errors for valid \\newcommand definitions", () => {
    const text = `\\newcommand{\\RR}{\\mathbb{R}}
\\newcommand{\\NN}{\\mathbb{N}}
`
    expect(lintMac(text)).toHaveLength(0)
  })

  it("no errors for \\newcommand with argument count", () => {
    const text = `\\newcommand{\\norm}[1]{\\left\\|#1\\right\\|}
`
    expect(lintMac(text)).toHaveLength(0)
  })

  it("no errors for comment lines", () => {
    const text = `% This is a comment
\\newcommand{\\RR}{\\mathbb{R}}
`
    expect(lintMac(text)).toHaveLength(0)
  })

  it("no errors for blank lines", () => {
    const text = `\\newcommand{\\RR}{\\mathbb{R}}

\\newcommand{\\NN}{\\mathbb{N}}
`
    expect(lintMac(text)).toHaveLength(0)
  })

  it("error for duplicate command", () => {
    const text = `\\newcommand{\\RR}{\\mathbb{R}}
\\newcommand{\\RR}{\\mathbb{R}}
`
    const markers = lintMac(text)
    expect(markers.some(m => m.message.includes("duplicado") && m.severity === Severity.Error)).toBe(true)
  })

  it("error for unmatched closing brace", () => {
    const text = `\\newcommand{\\RR}{\\mathbb{R}}}
`
    const markers = lintMac(text)
    expect(markers.some(m => m.message.includes("sin abrir") && m.severity === Severity.Error)).toBe(true)
  })

  it("error for unclosed brace", () => {
    const text = `\\newcommand{\\RR}{\\mathbb{R}
`
    const markers = lintMac(text)
    expect(markers.some(m => m.message.includes("sin cerrar") && m.severity === Severity.Error)).toBe(true)
  })

  it("warning for non-command, non-comment line", () => {
    const text = `this line does not belong here
`
    const markers = lintMac(text)
    expect(markers.some(m => m.severity === Severity.Warning)).toBe(true)
  })
})

// ── lintFile dispatcher ───────────────────────────────────────────────────────

describe("lintFile", () => {
  it("dispatches .bib extension to bibtex linter", () => {
    const bib = "@article{x, author={A}, journal={J}, year={2020},}"
    // Missing title → warning
    const markers = lintFile(bib, "references.bib", emptyCtx, MarkerSeverity)
    expect(markers.some(m => m.message.includes("title"))).toBe(true)
  })

  it("dispatches macros.md to macros linter", () => {
    const text = "\\newcommand{\\A}{1}\n\\newcommand{\\A}{2}\n"
    const markers = lintFile(text, "macros.md", emptyCtx, MarkerSeverity)
    expect(markers.some(m => m.message.includes("duplicado"))).toBe(true)
  })

  it("dispatches other filenames to content linter", () => {
    const markers = lintFile("$$unclosed", "notes.md", emptyCtx, MarkerSeverity)
    expect(markers.some(m => m.message.includes("$$"))).toBe(true)
  })

  it("dispatches custom bib filenames correctly", () => {
    const bib = "@article{ok, author={A}, title={T}, journal={J}, year={2020},}"
    expect(lintFile(bib, "my-refs.bib", emptyCtx, MarkerSeverity)).toHaveLength(0)
  })
})

// ── lintFileSummary ───────────────────────────────────────────────────────────

describe("lintFileSummary", () => {
  it("returns zero counts for clean file", () => {
    const summary = lintFileSummary("# Hello world\n\nJust text.", "notes.md", emptyCtx)
    expect(summary.errors).toBe(0)
    expect(summary.warnings).toBe(0)
  })

  it("counts errors correctly", () => {
    const summary = lintFileSummary("$$unclosed", "notes.md", emptyCtx)
    expect(summary.errors).toBeGreaterThan(0)
  })

  it("counts warnings from bib file", () => {
    const bib = "@article{x, author={A}, journal={J}, year={2020},}"
    const summary = lintFileSummary(bib, "refs.bib", emptyCtx)
    expect(summary.warnings).toBeGreaterThan(0) // missing title
  })

  it("does not require monaco import (uses internal severity constants)", () => {
    // If lintFileSummary works without passing MarkerSeverity, the internal constants work
    const summary = lintFileSummary("$$a$$", "file.md", emptyCtx)
    expect(summary.errors).toBe(0)
    expect(summary.warnings).toBe(0)
  })
})
