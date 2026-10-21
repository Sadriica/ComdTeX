import { describe, expect, it } from "vitest"
import { computeCursorContext, envTypeEdit, inlineToDisplayEdit } from "./cursorContext"

const at = (text: string, marker = "|") => {
  const idx = text.indexOf(marker)
  const clean = text.replace(marker, "")
  const before = clean.slice(0, idx).split("\n")
  return computeCursorContext(clean, before.length, before[before.length - 1].length + 1)
}

describe("computeCursorContext", () => {
  it("detects inline math", () => {
    expect(at("a $x +| y$ b").inMath).toBe("inline")
    expect(at("a $x$ b|").inMath).toBeNull()
    expect(at("price \\$5 and |").inMath).toBeNull()
  })

  it("detects display math across lines and ignores it inside code", () => {
    expect(at("$$\nx =| 1\n$$").inMath).toBe("display")
    expect(at("$$\nx = 1\n$$\nafter|").inMath).toBeNull()
    expect(at("```\n$$ x |\n```").inMath).toBeNull()
  })

  it("finds the innermost enclosing block and its opener line", () => {
    const ctx = at(":::theorem[T]\nbody |\n:::")
    expect(ctx.block).toEqual({ type: "theorem", startLine: 1 })
    expect(at(":::theorem\nx\n:::\nafter|").block).toBeNull()
    expect(at(":::theorem\n:::proof\nin|\n:::\n:::").block?.type).toBe("proof")
  })

  it("counts the opener line itself as inside the block", () => {
    expect(at(":::lem|ma").block?.type).toBe("lemma")
  })

  it("flags tables, labels, refs, citations and gaps under the cursor", () => {
    expect(at("| a | b ^", "^").inTable).toBe(true)
    expect(at("text").inTable).toBe(false)
    expect(at(":::theorem{#thm:g|ap}").label).toBe("thm:gap")
    expect(at("see @thm:g|ap now").ref).toBe("thm:gap")
    expect(at("see @notes/a@def:x| now").ref).toBe("def:x")
    expect(at("as [@levin2017; @a|lon]").citation).toBe(true)
    expect(at("as [@levin2017] |x").citation).toBe(false)
    expect(at("fill {{? a hi|nt}} here").onGap).toBe(true)
  })

  it("reports the line and selection flag", () => {
    const ctx = computeCursorContext("a\nbb", 2, 2, true)
    expect(ctx.line).toBe("bb")
    expect(ctx.lineNumber).toBe(2)
    expect(ctx.hasSelection).toBe(true)
  })
})

describe("inlineToDisplayEdit", () => {
  it("replaces the span under the cursor with a $$ block", () => {
    const edit = inlineToDisplayEdit("$x^2$", 3)
    expect(edit).toEqual({ startColumn: 1, endColumn: 6, text: "$$\nx^2\n$$" })
  })

  it("moves display math onto its own lines inside a paragraph", () => {
    const line = "so $a+b$ holds"
    const edit = inlineToDisplayEdit(line, 5)!
    const applied = line.slice(0, edit.startColumn - 1) + edit.text + line.slice(edit.endColumn - 1)
    expect(applied).toBe("so \n$$\na+b\n$$\n holds")
  })

  it("is null outside math and for display fences", () => {
    expect(inlineToDisplayEdit("no math here", 3)).toBeNull()
    expect(inlineToDisplayEdit("$$ x $$", 4)).toBeNull()
  })
})

describe("envTypeEdit", () => {
  it("replaces only the type", () => {
    const line = ":::theorem[Spectral gap]{#thm:gap}"
    const edit = envTypeEdit(line, "lemma")!
    const applied = line.slice(0, edit.startColumn - 1) + edit.text + line.slice(edit.endColumn - 1)
    expect(applied).toBe(":::lemma[Spectral gap]{#thm:gap}")
    expect(envTypeEdit("not a fence", "lemma")).toBeNull()
  })
})
