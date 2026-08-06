import { describe, it, expect } from "vitest"
import { matchesQuery } from "./PanelSearch"

describe("matchesQuery", () => {
  it("matches everything on an empty or blank query", () => {
    expect(matchesQuery("cualquier cosa", "")).toBe(true)
    expect(matchesQuery("cualquier cosa", "   ")).toBe(true)
  })

  it("is case-insensitive", () => {
    expect(matchesQuery("Teorema de Green", "green")).toBe(true)
    expect(matchesQuery("teorema", "TEOREMA")).toBe(true)
  })

  it("ignores accents in both directions", () => {
    expect(matchesQuery("Índice general", "indice")).toBe(true)
    expect(matchesQuery("Indice general", "índice")).toBe(true)
    expect(matchesQuery("Álgebra", "algebra")).toBe(true)
  })

  it("matches on a substring, not only a prefix", () => {
    expect(matchesQuery("frac(a, b)", "rac")).toBe(true)
  })

  it("returns false when there is genuinely no match", () => {
    expect(matchesQuery("Teorema", "integral")).toBe(false)
  })

  it("does not treat ñ as n (they are different letters)", () => {
    expect(matchesQuery("año", "ano")).toBe(false)
  })
})
