import { describe, expect, it } from "vitest"
import { LANGS } from "./i18n"
import { buildFileEntries, rankFileEntries } from "./paletteSources"
import { editDistance, rankSettingEntries, typoFileMatches } from "./paletteExtras"

const entries = buildFileEntries(
  [
    { path: "/v/Álgebra/Sección-3_intro.md" },
    { path: "/v/data/growthCurves.csv" },
    { path: "/v/refs/references.bib" },
    { path: "/v/results/summary.json" },
    { path: "/v/papers/introduction.md" },
    { path: "/v/papers/figure-list.pdf" },
  ],
  "/v",
)

const names = (q: string) => rankFileEntries(entries, q, []).map((r) => r.entry.name)

describe("files mode matching (facts the palette relies on)", () => {
  it("is accent and case insensitive in both directions", () => {
    expect(names("seccion")[0]).toBe("Sección-3_intro.md")
    expect(names("SECCIÓN")[0]).toBe("Sección-3_intro.md")
    expect(names("algebra")).toContain("Sección-3_intro.md")
  })

  it("matches across separators, camelCase and out-of-order words", () => {
    expect(names("growth curves")[0]).toBe("growthCurves.csv")
    expect(names("curves growth")[0]).toBe("growthCurves.csv")
    expect(names("gc")[0]).toBe("growthCurves.csv")
    expect(names("intro seccion")[0]).toBe("Sección-3_intro.md")
  })

  it("reaches non-note files by name and by extension", () => {
    expect(names("references bib")[0]).toBe("references.bib")
    expect(names("summary")[0]).toBe("summary.json")
    expect(names("figure list")[0]).toBe("figure-list.pdf")
  })

  it("matches through the folder path", () => {
    expect(names("data growth")[0]).toBe("growthCurves.csv")
  })
})

describe("typoFileMatches", () => {
  it("computes a capped edit distance with swaps", () => {
    expect(editDistance("form", "from", 1)).toBe(1)
    expect(editDistance("abc", "abcdef", 2)).toBe(3)
  })

  it("finds a file despite a missing, extra, swapped or wrong letter", () => {
    expect(typoFileMatches(entries, "itroduction")[0]?.entry.name).toBe("introduction.md")
    expect(typoFileMatches(entries, "introdution")[0]?.entry.name).toBe("introduction.md")
    expect(typoFileMatches(entries, "refrences")[0]?.entry.name).toBe("references.bib")
    expect(typoFileMatches(entries, "sumary")[0]?.entry.name).toBe("summary.json")
  })

  it("does not guess short terms or unrelated names", () => {
    expect(typoFileMatches(entries, "teh")).toEqual([])
    expect(typoFileMatches(entries, "zzzzzz")).toEqual([])
  })
})

describe("rankSettingEntries", () => {
  it("finds a setting by label in either language, ignoring accents", () => {
    const en = rankSettingEntries("word wrap", LANGS.en)
    expect(en.some((r) => r.entry.id === "wordWrap")).toBe(true)
    const es = rankSettingEntries("guardado", LANGS.es)
    expect(es.some((r) => r.entry.id === "autoSaveMs")).toBe(true)
  })
})
