import { describe, expect, it } from "vitest"
import { foldText, fuzzyMatch, fuzzyScore, positionRanges, rankItems } from "./fuzzy"
import { perfBudget } from "./perfBudget"

describe("foldText", () => {
  it("folds case and accents but keeps ñ distinct", () => {
    expect(foldText("Índice")).toBe("indice")
    expect(foldText("Niño")).toBe("niño")
    expect(foldText("ÑANDÚ")).toBe("ñandu")
  })
  it("keeps the length so positions index the original text", () => {
    for (const s of ["Índice", "Niño", "résumé", "naïve café", "áb"]) {
      expect(foldText(s).length).toBe(s.length)
    }
  })
})

describe("fuzzyMatch", () => {
  it("returns null when the query is not a subsequence", () => {
    expect(fuzzyMatch("xyz", "Save current file")).toBeNull()
    expect(fuzzyMatch("sfz", "Save current file")).toBeNull()
  })

  it("returns the matched positions in the original text", () => {
    const m = fuzzyMatch("save", "Save current file")
    expect(m?.positions).toEqual([0, 1, 2, 3])
  })

  it("matches acronyms across word starts", () => {
    const m = fuzzyMatch("scf", "Save current file")
    expect(m?.positions).toEqual([0, 5, 13])
  })

  it("scores a prefix above a mid-word match", () => {
    const prefix = fuzzyMatch("cit", "Citation manager")!.score
    const middle = fuzzyMatch("cit", "Insert citation")!.score
    expect(prefix).toBeGreaterThan(middle)
  })

  it("scores a word-start run above the same run inside a word", () => {
    const wordStart = fuzzyMatch("gap", "Fill gap with AI")!.score
    const insideWord = fuzzyMatch("gap", "Megapixel count")!.score
    expect(wordStart).toBeGreaterThan(insideWord)
  })

  it("scores a consecutive run above the same letters spread out", () => {
    const run = fuzzyMatch("abc", "yyxabc")!.score
    const spread = fuzzyMatch("abc", "yyxaxbxxc")
    // Scattered mid-word letters are rejected outright or at least ranked lower.
    expect(spread === null || run > spread.score).toBe(true)
  })

  it("is accent insensitive but ñ is its own letter", () => {
    expect(fuzzyMatch("indice", "Índice")).not.toBeNull()
    expect(fuzzyMatch("nino", "Niño")).toBeNull()
    expect(fuzzyMatch("niño", "Niño")).not.toBeNull()
  })

  it("requires every whitespace separated term", () => {
    expect(fuzzyMatch("spectral gap", "spectral-gap.md")).not.toBeNull()
    expect(fuzzyMatch("spectral zebra", "spectral-gap.md")).toBeNull()
  })

  it("treats an empty query as a match of everything", () => {
    expect(fuzzyMatch("", "anything")).toEqual({ score: 0, positions: [] })
  })

  it("rejects scattered mid-word noise for longer queries", () => {
    expect(fuzzyMatch("hcw", "The quick brown fox")).toBeNull()
  })
})

describe("fuzzyScore fields", () => {
  it("weights the label above keywords above the description", () => {
    const fields = (label: string, kw: string, desc: string) => [
      { text: label, weight: 1 },
      { text: kw, weight: 0.6 },
      { text: desc, weight: 0.35 },
    ]
    const inLabel = fuzzyScore("proof", fields("Proof", "", ""))!
    const inKeyword = fuzzyScore("proof", fields("Other", "proof", ""))!
    const inDescription = fuzzyScore("proof", fields("Other", "", "proof"))!
    expect(inLabel.score).toBeGreaterThan(inKeyword.score)
    expect(inKeyword.score).toBeGreaterThan(inDescription.score)
  })

  it("only counts exactOnly fields for a prefix of the whole field", () => {
    const fields = (q: string) =>
      fuzzyScore(q, [
        { text: "Something else", weight: 1 },
        { text: "Insertar", weight: 0.5, exactOnly: true },
      ])
    expect(fields("ins")).not.toBeNull() // prefix of the category
    expect(fields("ntr")).toBeNull() // fuzzy inside the category does not count
  })

  it("only reports label positions", () => {
    const r = fuzzyScore("abc", [
      { text: "xx", weight: 1 },
      { text: "abc", weight: 0.6 },
    ])!
    expect(r.field).toBe(1)
    expect(r.positions).toEqual([])
  })

  it("lets different terms match different fields", () => {
    const r = fuzzyScore("insert cita", [
      { text: "Insert BibTeX citation", weight: 1 },
      { text: "cita", weight: 0.6 },
    ])
    expect(r).not.toBeNull()
  })
})

describe("rankItems", () => {
  it("is stable for equal scores", () => {
    const items = ["alpha one", "alpha two", "alpha six"]
    const ranked = rankItems(items, "alpha", (s) => [{ text: s, weight: 1 }])
    expect(ranked.map((r) => r.item)).toEqual(["alpha one", "alpha two", "alpha six"])
  })
})

describe("positionRanges", () => {
  it("collapses runs", () => {
    expect(positionRanges([0, 1, 2, 5, 7, 8])).toEqual([
      [0, 3],
      [5, 6],
      [7, 9],
    ])
  })
})

describe("performance", () => {
  it("ranks 5000 file names in well under a keystroke budget", () => {
    const names = Array.from({ length: 5000 }, (_, i) => `notes/topic-${i}/lecture-notes-${i}.md`)
    rankItems(names, "ln", (s) => [{ text: s, weight: 1 }]) // warm the cache
    const t0 = performance.now()
    const ranked = rankItems(names, "lecn 42", (s) => [{ text: s, weight: 1 }])
    const ms = performance.now() - t0
    expect(ranked.length).toBeGreaterThan(0)
    expect(ms).toBeLessThan(perfBudget(300))
  })
})
