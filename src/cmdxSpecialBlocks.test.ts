import { describe, expect, it } from "vitest"
import { toStorage, toCmdx } from "./cmdxFormat"

// Regression: ComdTeX-only blocks (truth tables, graphs, plots, flowcharts,
// pseudocode, commutative diagrams, code) used to be rewritten to a generic
// `> [!note] Type: title` callout on every save, which was lossy and
// one-directional: reopening showed a "Nota (Type: …)" box with raw text and
// no reload could recover the original block. They must now round-trip verbatim.

const SPECIAL_CASES: { name: string; src: string }[] = [
  {
    name: "truth (title contains a colon, the reported case)",
    src: ":::truth[Equivalencia: contrapositiva]\n(p -> q) <-> (~q -> ~p)\n:::",
  },
  { name: "graph", src: ":::graph[Camino mínimo]\nA -- B : 4\nA -- C : 2\n:::" },
  { name: "plot (body has function shorthands that must NOT expand)", src: ":::plot[Densidad]\nf(x) = exp(-x^2/2) / sqrt(2*pi)\nxmin = -4\nxmax = 4\n:::" },
  { name: "flowchart", src: ":::flowchart[Búsqueda binaria]\nWHILE lo <= hi\n  mid <- (lo + hi) / 2\n:::" },
  { name: "pseudocode", src: ":::pseudocode[Búsqueda binaria]\nALGORITHM BinarySearch(A, target)\nRETURN mid\n:::" },
  { name: "commdiag", src: ":::commdiag[Cuadrado]\nA -> B\nA -> C\n:::" },
  { name: "code", src: ":::code python\nx = 1\nprint(x)\n:::" },
]

describe("special-block CMDX round-trip (lossless)", () => {
  for (const { name, src } of SPECIAL_CASES) {
    for (const format of ["md", "tex"] as const) {
      it(`${name} survives a ${format} save→reopen verbatim`, () => {
        const onDisk = toStorage(src, format)
        // The block must NOT have been turned into a callout / LaTeX env.
        expect(onDisk).not.toContain("[!note]")
        expect(onDisk).not.toContain("\\begin{truth}")
        // Reopening must reproduce the original block exactly.
        expect(toCmdx(onDisk, format)).toBe(src)
      })
    }
  }

  it("does not shorthand-expand the body of a :::plot on save (md)", () => {
    const onDisk = toStorage(":::plot[D]\nf(x) = exp(-x^2/2)\n:::", "md")
    expect(onDisk).toContain("exp(-x^2/2)")
    expect(onDisk).not.toContain("\\exp")
  })

  // Regression: `:::code <lang>` (a code block WITH a language) was invisible to
  // the special-block mask because CMDX_ENV_START_RE rejects the trailing token,
  // so a shorthand token in the body (`lim`, `frac`, `abs`, `sqrt`, `table`, …)
  // got expanded, corrupting the code listing on disk. Must be verbatim.
  it("does not shorthand-expand a :::code block that has a language (tex)", () => {
    const src = ":::code python\nreturn abs(x) + sqrt(y)\n:::"
    const onDisk = toStorage(src, "tex")
    expect(onDisk).toContain("abs(x) + sqrt(y)")
    expect(onDisk).not.toContain("\\left|")
    expect(onDisk).not.toContain("\\sqrt")
    expect(toCmdx(onDisk, "tex")).toBe(src)
  })

  it("preserves a :::code block with a language and a table shorthand (md)", () => {
    const src = ":::code python\ndf = table(A, B)\n:::"
    const onDisk = toStorage(src, "md")
    expect(onDisk).toContain("table(A, B)")
    expect(onDisk).not.toContain("|")
    expect(toCmdx(onDisk, "md")).toBe(src)
  })

  // Regression: a special block nested inside a normal environment. The env
  // becomes a `> ` callout on save; the special block's placeholder used to get
  // the `> ` prefix on only its first line, so on reopen every later line
  // (incl. the closing `:::`) fell out of the callout and the structure garbled.
  it("preserves a :::code nested inside a :::theorem across a md round-trip", () => {
    const src = ":::theorem[T]\n:::code\nx = 1\ny = 2\n:::\n:::"
    const onDisk = toStorage(src, "md")
    expect(onDisk).toContain("[!abstract]")
    // Every line of the nested block stays inside the callout body.
    expect(onDisk).toContain("> :::code")
    expect(onDisk).toContain("> x = 1")
    expect(onDisk).toContain("> :::")
    expect(toCmdx(onDisk, "md")).toBe(src)
  })

  it("still converts ordinary environments to Obsidian callouts (md)", () => {
    // Sanity: the masking must not affect normal theorem/note envs.
    const onDisk = toStorage(":::theorem[Pitágoras]\na^2 + b^2 = c^2\n:::", "md")
    expect(onDisk).toContain("[!abstract]")
  })
})

describe("recovery of files corrupted by older versions", () => {
  it("restores a mangled `[!note] Truth: …` md callout back to :::truth", () => {
    const corrupted = "> [!note] Truth: Equivalencia: contrapositiva\n> (p -> q) <-> (~q -> ~p)"
    expect(toCmdx(corrupted, "md")).toBe(":::truth[Equivalencia: contrapositiva]\n(p -> q) <-> (~q -> ~p)\n:::")
  })

  it("always restores unambiguous types regardless of body (md)", () => {
    for (const [prefix, env] of [["Flowchart", "flowchart"], ["Pseudocode", "pseudocode"], ["Commdiag", "commdiag"]]) {
      expect(toCmdx(`> [!note] ${prefix}: T\n> body`, "md")).toBe(`:::${env}[T]\nbody\n:::`)
    }
  })

  it("restores ambiguous types (graph/plot/code) only when the body matches the DSL (md)", () => {
    // Body looks like the block → recovered.
    expect(toCmdx("> [!note] Graph: G\n> A -- B : 4", "md")).toBe(":::graph[G]\nA -- B : 4\n:::")
    expect(toCmdx("> [!note] Plot: P\n> f(x) = sin(x)", "md")).toBe(":::plot[P]\nf(x) = sin(x)\n:::")
    expect(toCmdx("> [!note] Code: c\n> def f(): return 1", "md")).toBe(":::code[c]\ndef f(): return 1\n:::")
  })

  it("does NOT recover an ambiguous type when the body is plain prose (no false positive)", () => {
    // A genuine note that happens to start "Graph:"/"Plot:" stays a note.
    expect(toCmdx("> [!note] Graph: my thoughts on graph theory\n> just prose here", "md"))
      .toBe(":::note[Graph: my thoughts on graph theory]\njust prose here\n:::")
    expect(toCmdx("> [!note] Plot: outline of my story\n> chapter one happens", "md"))
      .toBe(":::note[Plot: outline of my story]\nchapter one happens\n:::")
  })

  it("heals fully: recovered block re-saves verbatim (no re-corruption)", () => {
    const corrupted = "> [!note] Plot: D\n> f(x) = exp(-x)"
    const recovered = toCmdx(corrupted, "md")
    expect(recovered).toBe(":::plot[D]\nf(x) = exp(-x)\n:::")
    // Saving the recovered block must now keep it verbatim, not re-mangle it.
    expect(toStorage(recovered, "md")).not.toContain("[!note]")
    expect(toStorage(recovered, "md")).toContain(":::plot[D]")
  })

  it("does NOT touch a genuine note whose title isn't a special prefix", () => {
    expect(toCmdx("> [!note] My notes\n> hello", "md")).toBe(":::note[My notes]\nhello\n:::")
  })

  it("recovers a mangled .tex \\begin{graph} back to :::graph", () => {
    expect(toCmdx("\\begin{graph}\nA -- B : 4\n\\end{graph}", "tex")).toContain(":::graph")
  })
})
