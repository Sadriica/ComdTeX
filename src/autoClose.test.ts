import { describe, expect, it } from "vitest"
import { inFencedCode, keepsAutoClosedBacktick, keepsAutoClosedDollar } from "./autoClose"
import { isInMath } from "./completion/triggers"

const lines = (text: string) => {
  const all = text.split("\n")
  return (n: number) => all[n - 1] ?? ""
}

describe("price heuristic in isInMath", () => {
  const m = { getLineContent: () => "" }
  it("ignores a lone dollar before a digit", () => {
    expect(isInMath(m, 1, "costs $5 and sum")).toBe(false)
    expect(isInMath(m, 1, "costs $5 and $6 sum")).toBe(false)
  })
  it("keeps real math open", () => {
    expect(isInMath(m, 1, "so $sum")).toBe(true)
    expect(isInMath(m, 1, "so $2x + su")).toBe(false)
    expect(isInMath(m, 1, "so $")).toBe(true)
    expect(isInMath(m, 1, "$a$ then $5")).toBe(false)
    expect(isInMath(m, 1, "$a$ then $b")).toBe(true)
  })
})

describe("fences", () => {
  it("knows when a line is inside a fence", () => {
    const get = lines("```sh\necho\n```\nafter")
    expect(inFencedCode(get, 2)).toBe(true)
    expect(inFencedCode(get, 4)).toBe(false)
    expect(inFencedCode(lines("~~~\nx"), 2)).toBe(true)
  })
})

describe("auto-closed dollar", () => {
  it("closes after whitespace outside code and math", () => {
    expect(keepsAutoClosedDollar(lines("so $"), 1, 3)).toBe(true)
    expect(keepsAutoClosedDollar(lines("$"), 1, 0)).toBe(true)
    expect(keepsAutoClosedDollar(lines("(see $"), 1, 5)).toBe(true)
  })
  it("never closes inside code, after a word or a closing dollar", () => {
    expect(keepsAutoClosedDollar(lines("```sh\necho $"), 2, 5)).toBe(false)
    expect(keepsAutoClosedDollar(lines("run `echo $"), 1, 10)).toBe(false)
    expect(keepsAutoClosedDollar(lines("US$"), 1, 2)).toBe(false)
    expect(keepsAutoClosedDollar(lines("$x$"), 1, 2)).toBe(false)
    expect(keepsAutoClosedDollar(lines("$a + b$"), 1, 6)).toBe(false)
  })
})

describe("auto-closed backtick", () => {
  it("drops the twin of the third backtick", () => {
    expect(keepsAutoClosedBacktick(lines("a `"), 1, 2)).toBe(true)
    expect(keepsAutoClosedBacktick(lines("```"), 1, 2)).toBe(false)
    expect(keepsAutoClosedBacktick(lines("```sh\n`"), 2, 0)).toBe(false)
  })
})
