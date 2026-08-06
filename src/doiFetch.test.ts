import { describe, expect, it } from "vitest"

describe("ADS bibcodes", () => {
  it("recognizes a real bibcode", async () => {
    const { isAdsBibcode } = await import("./doiFetch")
    expect(isAdsBibcode("2024ApJ...900....1A")).toBe(true)
    expect(isAdsBibcode("1998A&A...333L..87S")).toBe(true)
  })

  it("rejects anything that is not 19 characters of bibcode shape", async () => {
    const { isAdsBibcode } = await import("./doiFetch")
    expect(isAdsBibcode("10.1234/abc")).toBe(false)
    expect(isAdsBibcode("2024ApJ")).toBe(false)
    expect(isAdsBibcode("")).toBe(false)
  })
})

describe("INSPIRE references", () => {
  it("parses recids, URLs and arXiv ids", async () => {
    const { parseInspireInput } = await import("./doiFetch")
    expect(parseInspireInput("https://inspirehep.net/literature/1234567")).toEqual({ kind: "recid", value: "1234567" })
    expect(parseInspireInput("inspire:98765")).toEqual({ kind: "recid", value: "98765" })
    expect(parseInspireInput("arXiv:2301.00001")).toEqual({ kind: "arxiv", value: "2301.00001" })
  })

  it("returns null for unrelated input", async () => {
    const { parseInspireInput } = await import("./doiFetch")
    expect(parseInspireInput("hello")).toBeNull()
  })
})
