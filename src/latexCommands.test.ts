import { describe, expect, it } from "vitest"
import katex from "katex"
import { generate } from "../scripts/gen-latex-commands.mjs"
import { LATEX_COMMANDS } from "./latexCommands"
import source from "./latexCommands.ts?raw"

describe("generated LaTeX command table", () => {
  it("is up to date with KaTeX (run `npm run gen:latex` after a KaTeX upgrade)", () => {
    // The committed file is exactly what the generator writes now.
    expect(source).toBe(generate().out)
  })

  it("holds about a thousand commands with glyphs and argument snippets", () => {
    expect(LATEX_COMMANDS.length).toBeGreaterThan(900)
    const byName = new Map(LATEX_COMMANDS.map((row) => [row[0], row]))
    expect(byName.get("alpha")?.[1]).toBe("α")
    expect(byName.get("frac")?.[2]).toBe("\\frac{${1}}{${2}}")
    expect(byName.get("sum")?.[2]).toContain("\\sum_{")
    expect(byName.get("begin{pmatrix}")?.[2]).toContain("\\end{pmatrix}")
    expect(byName.get("mathbb{R}")?.[1]).toBe("ℝ")
    expect(byName.has("ce")).toBe(true)
  })

  it("has no duplicate names", () => {
    const names = LATEX_COMMANDS.map((row) => row[0])
    expect(new Set(names).size).toBe(names.length)
  })

  it("only suggests symbols KaTeX can render", () => {
    // Every symbol-class entry must render without a parse error.
    const failures: string[] = []
    for (const [name, , snippet, group] of LATEX_COMMANDS) {
      if (group !== "s" || snippet) continue
      try {
        katex.renderToString(`\\${name}`, { throwOnError: true })
      } catch {
        failures.push(name)
      }
    }
    expect(failures).toEqual([])
  })
})
