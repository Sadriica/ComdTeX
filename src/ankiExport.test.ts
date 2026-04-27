import { describe, expect, it } from "vitest"
import { extractAnkiCards, applyClozeDeletions, exportAnkiTsv } from "./ankiExport"

describe("extractAnkiCards", () => {
  it("extracts theorem, lemma, corollary, proposition, definition", () => {
    const md = [
      ":::theorem[Pythagoras]",
      "a^2 + b^2 = c^2",
      ":::",
      "",
      ":::lemma",
      "Body L",
      ":::",
      "",
      ":::corollary",
      "Body C",
      ":::",
      "",
      ":::proposition",
      "Body P",
      ":::",
    ].join("\n")
    const cards = extractAnkiCards(md)
    const kinds = cards.map((c) => c.kind)
    expect(kinds).toEqual(["theorem", "lemma", "corollary", "proposition"])
    expect(cards[0].title).toBe("Pythagoras")
    expect(cards[0].back).toBe("a^2 + b^2 = c^2")
  })

  it("includes example and exercise environments", () => {
    const md = ":::example[Sample]\nFoo\n:::\n\n:::exercise\nBar\n:::"
    const cards = extractAnkiCards(md)
    expect(cards.map((c) => c.kind)).toEqual(["example", "exercise"])
    expect(cards[0].title).toBe("Sample")
  })

  it("converts cloze braces inside :::definition to Anki cloze syntax", () => {
    const md = ":::definition[Limit]\nA function is {{continuous}} when {{limit equals value}}.\n:::"
    const cards = extractAnkiCards(md)
    expect(cards).toHaveLength(1)
    expect(cards[0].type).toBe("Cloze")
    expect(cards[0].back).toContain("{{c1::continuous}}")
    expect(cards[0].back).toContain("{{c2::limit equals value}}")
  })

  it("keeps :::definition without braces as Basic", () => {
    const md = ":::definition[Group]\nA set with an associative operation.\n:::"
    const cards = extractAnkiCards(md)
    expect(cards[0].type).toBe("Basic")
  })

  it("ignores non-export environments like proof / remark / note", () => {
    const md = ":::proof\nQED\n:::\n\n:::remark\nx\n:::\n\n:::note\ny\n:::"
    expect(extractAnkiCards(md)).toEqual([])
  })
})

describe("applyClozeDeletions", () => {
  it("numbers cloze fields incrementally", () => {
    const { body, hasCloze } = applyClozeDeletions("{{a}} and {{b}}")
    expect(body).toBe("{{c1::a}} and {{c2::b}}")
    expect(hasCloze).toBe(true)
  })

  it("does not double-wrap existing clozes", () => {
    const { body, hasCloze } = applyClozeDeletions("{{c1::already}} and plain")
    expect(body).toBe("{{c1::already}} and plain")
    expect(hasCloze).toBe(false)
  })
})

describe("exportAnkiTsv", () => {
  it("emits header lines and TSV-separated rows", () => {
    const tsv = exportAnkiTsv([
      { type: "Basic", kind: "theorem", title: "T", front: "Theorem: T", back: "x = y" },
    ])
    expect(tsv).toContain("#separator:tab")
    expect(tsv).toContain("Basic\tTheorem: T\tx = y\tcomdtex theorem")
  })

  it("escapes newlines as <br> for multi-line backs", () => {
    const tsv = exportAnkiTsv([
      { type: "Basic", kind: "lemma", title: "", front: "Lema", back: "line1\nline2" },
    ])
    expect(tsv).toContain("line1<br>line2")
  })
})
