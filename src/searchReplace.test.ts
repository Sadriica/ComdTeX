import { describe, expect, it } from "vitest"
import { buildSearchRegExp, replaceMatchAt, replaceMatches } from "./searchReplace"

describe("buildSearchRegExp", () => {
  it("escapes plain-text regex metacharacters", () => {
    const re = buildSearchRegExp("a+b", { regex: false })
    expect(re).not.toBeNull()
    expect(re?.source).toBe("a\\+b")
  })

  it("applies whole-word boundaries when requested", () => {
    const re = buildSearchRegExp("cat", { wholeWord: true })
    expect(re).not.toBeNull()
    expect(re?.test("cat")).toBe(true)
    re!.lastIndex = 0
    expect(re?.test("concatenate")).toBe(false)
  })

  it("returns null for invalid regex input", () => {
    expect(buildSearchRegExp("(", { regex: true })).toBeNull()
  })
})

describe("replaceMatches", () => {
  it("replaces only exact plain-text matches with escaped input", () => {
    const re = buildSearchRegExp("a+b", { regex: false })
    expect(re).not.toBeNull()
    const result = replaceMatches("a+b aaab a+b", re!, "x")
    expect(result.count).toBe(2)
    expect(result.content).toBe("x aaab x")
  })

  it("respects whole-word semantics during replacement", () => {
    const re = buildSearchRegExp("cat", { wholeWord: true })
    expect(re).not.toBeNull()
    const result = replaceMatches("cat concatenate cat", re!, "dog")
    expect(result.count).toBe(2)
    expect(result.content).toBe("dog concatenate dog")
  })
})

describe("replaceMatchAt", () => {
  it("replaces only the selected line match", () => {
    const re = buildSearchRegExp("cat", {})
    expect(re).not.toBeNull()

    const result = replaceMatchAt("cat\ncat cat", re!, "dog", {
      line: 2,
      matchStart: 4,
      matchEnd: 7,
    })

    expect(result.count).toBe(1)
    expect(result.content).toBe("cat\ncat dog")
  })

  it("preserves regex replacement groups for the selected match", () => {
    const re = buildSearchRegExp("(cat)-(dog)", { regex: true })
    expect(re).not.toBeNull()

    const result = replaceMatchAt("cat-dog cat-dog", re!, "$2-$1", {
      line: 1,
      matchStart: 8,
      matchEnd: 15,
    })

    expect(result.count).toBe(1)
    expect(result.content).toBe("cat-dog dog-cat")
  })
})
