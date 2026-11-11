import { describe, expect, it } from "vitest"
import { isExactSymbolQuery, rankSymbols } from "./paletteSymbols"

const cmds = (q: string) => rankSymbols(q).map((s) => s.latex)

describe("rankSymbols", () => {
  it("puts the exact name first", () => {
    expect(rankSymbols("mu")[0].display).toBe("μ")
    expect(cmds("\\mu")[0]).toBe("\\mu")
  })
  it("does not match inside words", () => {
    expect(cmds("mu")).not.toContain("\\sum")
  })
  it("prefers the capital for a capital query and keeps both", () => {
    expect(cmds("Sigma")[0]).toBe("\\Sigma")
    expect(cmds("Sigma")).toContain("\\sigma")
    expect(cmds("sigma")[0]).toBe("\\sigma")
    expect(cmds("sigma")).toContain("\\Sigma")
  })
  it("finds the summation operator in English and Spanish", () => {
    expect(cmds("sum")[0]).toBe("\\sum")
    expect(cmds("suma")).toContain("\\sum")
    expect(cmds("sumatoria")).toContain("\\sum")
    expect(cmds("sum")).toContain("\\Sigma")
  })
  it("finds Spanish names", () => {
    expect(rankSymbols("alfa")[0].display).toBe("α")
    expect(cmds("flecha").length).toBeGreaterThan(0)
  })
  it("returns nothing for unknown text", () => {
    expect(rankSymbols("xyz")).toEqual([])
    expect(rankSymbols("")).toEqual([])
  })
  it("flags exact queries", () => {
    expect(isExactSymbolQuery("mu")).toBe(true)
    expect(isExactSymbolQuery("alfa")).toBe(true)
    expect(isExactSymbolQuery("arro")).toBe(false)
  })
})
