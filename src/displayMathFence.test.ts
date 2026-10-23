import { describe, expect, it } from "vitest"
import { isDisplayMathFence, singleLineDisplayMath } from "./displayMathFence"
import { findDisplayMathBlocks } from "./useDisplayMathPreview"

function model(text: string) {
  const lines = text.split("\n")
  return { getLineCount: () => lines.length, getLineContent: (n: number) => lines[n - 1] }
}

describe("display math fences", () => {
  it("accepts a bare or labelled fence and nothing else", () => {
    expect(isDisplayMathFence("$$")).toBe(true)
    expect(isDisplayMathFence("  $$  ")).toBe(true)
    expect(isDisplayMathFence("$$ {#eq:gap}")).toBe(true)
    expect(isDisplayMathFence("$$ x $$")).toBe(false)
    expect(isDisplayMathFence("$$x")).toBe(false)
    expect(isDisplayMathFence("text $$")).toBe(false)
  })

  it("reads single-line blocks with or without a label", () => {
    expect(singleLineDisplayMath("$$ x^2 $$")).toBe("x^2")
    expect(singleLineDisplayMath("$$ x^2 $$ {#eq:sq}")).toBe("x^2")
    expect(singleLineDisplayMath("$$ {#eq:sq}")).toBeNull()
    expect(singleLineDisplayMath("$$")).toBeNull()
  })

  it("pairs a labelled closing fence with its own opening fence", () => {
    const text = [
      ":::lemma[Bound]{#lem:b}",
      "$$",
      "a \\ge b",
      "$$ {#eq:b}",
      ":::",
      "",
      ":::proof",
      "Prose with $x$ that is not math.",
      ":::",
      "$$",
      "c = d",
      "$$ {#eq:c}",
      "$$ e $$ {#eq:e}",
    ].join("\n")
    const blocks = findDisplayMathBlocks(model(text))
    expect(blocks.map((b) => [b.startLine, b.endLine, b.expr])).toEqual([
      [2, 4, "a \\ge b"],
      [10, 12, "c = d"],
      [13, 13, "e"],
    ])
  })
})
