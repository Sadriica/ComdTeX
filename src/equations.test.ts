import { describe, it, expect, beforeEach } from "vitest"
import {
  resetEqCounters,
  nextEqNumber,
  prescanEquations,
  resolveEqRefs,
  wrapNumbered,
} from "./equations"

beforeEach(() => {
  resetEqCounters()
})

describe("nextEqNumber", () => {
  it("starts at 1 and increments", () => {
    expect(nextEqNumber()).toBe(1)
    expect(nextEqNumber()).toBe(2)
    expect(nextEqNumber()).toBe(3)
  })

  it("resets after resetEqCounters()", () => {
    nextEqNumber()
    nextEqNumber()
    resetEqCounters()
    expect(nextEqNumber()).toBe(1)
  })
})

describe("prescanEquations", () => {
  it("counts unlabeled blocks", () => {
    const text = "$$a$$\n$$b$$\n$$c$$"
    const labels = prescanEquations(text)
    expect(labels.size).toBe(0) // no labels defined
  })

  it("maps labeled blocks to their sequential number", () => {
    const text = "$$E = mc^2$$ {#eq:energy}\n$$x^2$$ {#eq:sq}"
    const labels = prescanEquations(text)
    expect(labels.get("eq:energy")).toBe(1)
    expect(labels.get("eq:sq")).toBe(2)
  })

  it("skips labels on unlabeled blocks (only labeled are tracked)", () => {
    const text = "$$a$$\n$$b$$ {#eq:second}\n$$c$$"
    const labels = prescanEquations(text)
    expect(labels.get("eq:second")).toBe(2)
    expect(labels.size).toBe(1)
  })

  it("handles colons and dots in label names", () => {
    const text = "$$x$$ {#eq:thm.1}"
    const labels = prescanEquations(text)
    expect(labels.get("eq:thm.1")).toBe(1)
  })
})

describe("resolveEqRefs", () => {
  it("replaces @eq:label with (n)", () => {
    const labels = new Map([["eq:energy", 3]])
    const result = resolveEqRefs("See @eq:energy for details.", labels)
    expect(result).toContain("(3)")
    expect(result).toContain('class="eq-ref"')
  })

  it("renders broken ref with (?)", () => {
    const labels = new Map<string, number>()
    const result = resolveEqRefs("See @eq:missing.", labels)
    expect(result).toContain("(?)")
    expect(result).toContain("eq-ref-broken")
  })

  it("resolves numeric @eq:1 directly", () => {
    const labels = new Map<string, number>()
    const result = resolveEqRefs("From @eq:1.", labels)
    expect(result).toContain("(1)")
  })

  it("replaces multiple refs in the same text", () => {
    const labels = new Map([["eq:a", 1], ["eq:b", 5]])
    const result = resolveEqRefs("@eq:a and @eq:b", labels)
    expect(result).toContain("(1)")
    expect(result).toContain("(5)")
  })

  it("leaves non-ref text untouched", () => {
    const labels = new Map<string, number>()
    const result = resolveEqRefs("no refs here", labels)
    expect(result).toBe("no refs here")
  })
})

describe("wrapNumbered", () => {
  it("wraps KaTeX HTML with equation number", () => {
    const result = wrapNumbered("<span>E=mc²</span>", 7)
    expect(result).toContain('class="eq-block"')
    expect(result).toContain("(7)")
    expect(result).toContain('class="eq-number"')
    expect(result).toContain("<span>E=mc²</span>")
  })
})
