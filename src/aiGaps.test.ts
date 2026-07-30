import { describe, it, expect } from "vitest"
import { findGaps, gapAtOffset, gapContext, cleanGapCompletion } from "./aiGaps"

describe("findGaps", () => {
  it("finds a bare marker", () => {
    const gaps = findGaps("Una definición: {{?}}\n")
    expect(gaps).toHaveLength(1)
    expect(gaps[0].hint).toBe("")
    expect(gaps[0].line).toBe(1)
  })

  it("captures the hint", () => {
    const gaps = findGaps("{{? enuncia el teorema de Green}}")
    expect(gaps[0].hint).toBe("enuncia el teorema de Green")
  })

  it("reports offsets that select exactly the marker", () => {
    const text = "abc {{?}} def"
    const gap = findGaps(text)[0]
    expect(text.slice(gap.start, gap.end)).toBe("{{?}}")
  })

  it("finds several gaps in document order with correct lines", () => {
    const gaps = findGaps("línea 1 {{?}}\nlínea 2\nlínea 3 {{? pista}}")
    expect(gaps.map((g) => g.line)).toEqual([1, 3])
  })

  it("ignores gaps inside fenced code — that is documentation, not a request", () => {
    expect(findGaps("```\n{{?}}\n```\n")).toEqual([])
    expect(findGaps("~~~md\n{{? x}}\n~~~\n")).toEqual([])
  })

  it("still finds a gap after a fenced block", () => {
    const gaps = findGaps("```\n{{?}}\n```\ndespués {{? real}}")
    expect(gaps).toHaveLength(1)
    expect(gaps[0].hint).toBe("real")
  })

  it("returns nothing for a document with no markers", () => {
    expect(findGaps("texto normal con {{llaves}} pero sin interrogante")).toEqual([])
  })
})

describe("gapAtOffset", () => {
  const text = "abc {{?}} def"

  it("finds the gap when the cursor is inside it", () => {
    expect(gapAtOffset(text, 6)).not.toBeNull()
  })

  it("finds it at either boundary", () => {
    expect(gapAtOffset(text, 4)).not.toBeNull()
    expect(gapAtOffset(text, 9)).not.toBeNull()
  })

  it("returns null away from any gap", () => {
    expect(gapAtOffset(text, 0)).toBeNull()
    expect(gapAtOffset(text, 12)).toBeNull()
  })
})

describe("gapContext", () => {
  const doc = Array.from({ length: 40 }, (_, i) => `línea ${i + 1}`).join("\n")
    .replace("línea 20", "línea 20 {{?}}")

  it("includes the gap's own line", () => {
    const gap = findGaps(doc)[0]
    expect(gapContext(doc, gap)).toContain("{{?}}")
  })

  it("is bounded by the radius rather than sending the whole document", () => {
    const gap = findGaps(doc)[0]
    const context = gapContext(doc, gap, 3)
    expect(context.split("\n")).toHaveLength(7)
    expect(context).toContain("línea 17")
    expect(context).not.toContain("línea 16")
  })

  it("clamps at the start of the document", () => {
    const short = "{{?}}\nsegunda"
    const gap = findGaps(short)[0]
    expect(gapContext(short, gap, 10)).toBe(short)
  })
})

describe("cleanGapCompletion", () => {
  it("trims whitespace", () => {
    expect(cleanGapCompletion("  respuesta  ")).toBe("respuesta")
  })

  it("unwraps a code fence the model added", () => {
    expect(cleanGapCompletion("```markdown\nLa derivada de $x^2$ es $2x$.\n```")).toBe(
      "La derivada de $x^2$ es $2x$.",
    )
  })

  it("keeps a fence that is genuinely part of the answer", () => {
    const answer = "Ejemplo:\n\n```python\nprint(1)\n```\n\nY listo."
    expect(cleanGapCompletion(answer)).toBe(answer)
  })

  it("strips a marker the model echoed back", () => {
    expect(cleanGapCompletion("{{?}} la respuesta")).toBe("la respuesta")
  })

  it("returns empty for an empty answer", () => {
    expect(cleanGapCompletion("   ")).toBe("")
  })
})
