import { describe, it, expect } from "vitest"
import {
  resolveEnterOverride,
  splitTableRow,
  isTableDelimiterRow,
  normalizeTableBlock,
  findTableBlock,
  raggedTableRows,
  computeFoldRanges,
  splitIntoSections,
  sectionSlug,
} from "./markdownEditing"

describe("resolveEnterOverride, bullet lists", () => {
  it("continues a bullet with the same marker and indentation", () => {
    expect(resolveEnterOverride("- uno")).toEqual({ kind: "insertLine", text: "- " })
    expect(resolveEnterOverride("* uno")).toEqual({ kind: "insertLine", text: "* " })
    expect(resolveEnterOverride("+ uno")).toEqual({ kind: "insertLine", text: "+ " })
  })

  it("preserves nesting: no extra Enter needed to stay at the same level", () => {
    expect(resolveEnterOverride("  - anidado")).toEqual({ kind: "insertLine", text: "  - " })
    expect(resolveEnterOverride("\t\t- profundo")).toEqual({ kind: "insertLine", text: "\t\t- " })
  })

  it("outdents one level on an abandoned nested marker", () => {
    expect(resolveEnterOverride("    - ", 2)).toEqual({ kind: "replaceLine", text: "  - " })
    expect(resolveEnterOverride("\t- ")).toEqual({ kind: "replaceLine", text: "- " })
  })

  it("clears an abandoned top-level marker instead of adding another", () => {
    expect(resolveEnterOverride("- ")).toEqual({ kind: "replaceLine", text: "" })
  })
})

describe("resolveEnterOverride, ordered lists", () => {
  it("increments the number", () => {
    expect(resolveEnterOverride("1. uno")).toEqual({ kind: "insertLine", text: "2. " })
    expect(resolveEnterOverride("9) nueve")).toEqual({ kind: "insertLine", text: "10) " })
    expect(resolveEnterOverride("  3. tres")).toEqual({ kind: "insertLine", text: "  4. " })
  })

  it("clears an abandoned number", () => {
    expect(resolveEnterOverride("1. ")).toEqual({ kind: "replaceLine", text: "" })
  })
})

describe("resolveEnterOverride, task items", () => {
  it("continues with an unchecked box regardless of the current state", () => {
    expect(resolveEnterOverride("- [ ] tarea")).toEqual({ kind: "insertLine", text: "- [ ] " })
    expect(resolveEnterOverride("- [x] hecha")).toEqual({ kind: "insertLine", text: "- [ ] " })
    expect(resolveEnterOverride("- [X] hecha")).toEqual({ kind: "insertLine", text: "- [ ] " })
  })

  it("keeps indentation for nested tasks", () => {
    expect(resolveEnterOverride("  - [ ] sub")).toEqual({ kind: "insertLine", text: "  - [ ] " })
  })

  it("clears an abandoned task box", () => {
    expect(resolveEnterOverride("- [ ] ")).toEqual({ kind: "replaceLine", text: "" })
  })
})

describe("resolveEnterOverride, blockquotes", () => {
  it("continues a quote, including nested levels", () => {
    expect(resolveEnterOverride("> cita")).toEqual({ kind: "insertLine", text: "> " })
    expect(resolveEnterOverride("> > anidada")).toEqual({ kind: "insertLine", text: "> > " })
  })

  it("clears an abandoned quote marker", () => {
    expect(resolveEnterOverride("> ")).toEqual({ kind: "replaceLine", text: "" })
  })
})

describe("resolveEnterOverride, tables", () => {
  it("adds a row with the same column count", () => {
    expect(resolveEnterOverride("| a | b |")).toEqual({ kind: "insertLine", text: "|   |   |" })
    expect(resolveEnterOverride("| a | b | c |")).toEqual({ kind: "insertLine", text: "|   |   |   |" })
  })

  it("continues from the delimiter row into a body row", () => {
    expect(resolveEnterOverride("|---|---|")).toEqual({ kind: "insertLine", text: "|   |   |" })
  })

  it("exits the table when the row was left blank", () => {
    expect(resolveEnterOverride("|   |   |")).toEqual({ kind: "replaceLine", text: "" })
  })

  it("keeps a row with SOME empty cells (that is valid markdown)", () => {
    expect(resolveEnterOverride("| a |  |")).toEqual({ kind: "insertLine", text: "|   |   |" })
  })
})

describe("resolveEnterOverride, leaves ordinary text alone", () => {
  it.each([
    "texto normal",
    "",
    "# Encabezado",
    "---",
    "$$ x = 1 $$",
    ":::theorem",
    "A -> B [f]",
  ])("returns null for %j", (line) => {
    expect(resolveEnterOverride(line)).toBeNull()
  })
})

describe("splitTableRow", () => {
  it("drops the outer pipes", () => {
    expect(splitTableRow("| a | b |")).toEqual([" a ", " b "])
  })

  it("keeps escaped pipes inside their cell", () => {
    expect(splitTableRow("| a \\| b | c |")).toEqual([" a \\| b ", " c "])
  })

  it("returns nothing for a non-row", () => {
    expect(splitTableRow("no es una tabla")).toEqual([])
  })
})

describe("isTableDelimiterRow", () => {
  it.each(["|---|---|", "| :--- | ---: |", "|:-:|:-:|"])("accepts %j", (line) => {
    expect(isTableDelimiterRow(line)).toBe(true)
  })

  it("rejects a body row", () => {
    expect(isTableDelimiterRow("| a | b |")).toBe(false)
  })
})

describe("normalizeTableBlock", () => {
  it("pads short rows with empty cells and aligns the pipes", () => {
    const out = normalizeTableBlock([
      "| Nombre | Nota | Obs |",
      "|---|---|---|",
      "| Ana | 9 |",
      "| Beto |",
    ])
    expect(out).toEqual([
      "| Nombre | Nota | Obs |",
      "| ------ | ---- | --- |",
      "| Ana    | 9    |     |",
      "| Beto   |      |     |",
    ])
  })

  it("preserves alignment colons", () => {
    const out = normalizeTableBlock(["| a | b |", "|:---|---:|", "| 1 | 2 |"])
    expect(out[1]).toBe("| :--- | ---: |")
  })

  it("never drops cells from a row that is too long", () => {
    const out = normalizeTableBlock(["| a |", "|---|", "| 1 | 2 |"])
    expect(splitTableRow(out[2])).toHaveLength(2)
    expect(out[2]).toContain("2")
  })

  it("is idempotent", () => {
    const once = normalizeTableBlock(["| a | b |", "|---|---|", "| 1 |"])
    expect(normalizeTableBlock(once)).toEqual(once)
  })
})

describe("findTableBlock", () => {
  it("spans the contiguous run of rows", () => {
    const lines = ["texto", "| a | b |", "|---|---|", "| 1 | 2 |", "", "más texto"]
    expect(findTableBlock(lines, 2)).toEqual({ start: 1, end: 3 })
  })

  it("returns null off the table", () => {
    expect(findTableBlock(["texto"], 0)).toBeNull()
  })
})

describe("raggedTableRows", () => {
  it("flags rows whose column count differs from the header", () => {
    const lines = ["| a | b | c |", "|---|---|---|", "| 1 | 2 |", "| 1 | 2 | 3 |"]
    expect(raggedTableRows(lines)).toEqual([{ line: 2, expected: 3, actual: 2 }])
  })

  it("says nothing about a well-formed table", () => {
    expect(raggedTableRows(["| a | b |", "|---|---|", "| 1 | 2 |"])).toEqual([])
  })
})

describe("computeFoldRanges", () => {
  const lines = (s: string) => s.split("\n")

  it("folds a heading section up to the next heading of the same level", () => {
    const ranges = computeFoldRanges(lines("# A\ntexto\ntexto\n# B\notro"))
    expect(ranges).toContainEqual({ start: 1, end: 3, kind: "heading" })
  })

  it("nests subsections inside their parent section", () => {
    const ranges = computeFoldRanges(lines("# A\n## A1\nx\n## A2\ny\n# B"))
    expect(ranges).toContainEqual({ start: 2, end: 3, kind: "heading" }) // ## A1
    expect(ranges).toContainEqual({ start: 4, end: 5, kind: "heading" }) // ## A2
    expect(ranges).toContainEqual({ start: 1, end: 5, kind: "heading" }) // # A
  })

  it("runs the last section to the end of the document", () => {
    const ranges = computeFoldRanges(lines("# A\nx\n# B\ny\nz"))
    expect(ranges).toContainEqual({ start: 3, end: 5, kind: "heading" })
  })

  it("still folds ::: blocks", () => {
    const ranges = computeFoldRanges(lines(":::theorem\ncuerpo\n:::"))
    expect(ranges).toContainEqual({ start: 1, end: 3, kind: "block" })
  })

  it("ignores headings inside fenced code", () => {
    const ranges = computeFoldRanges(lines("# Real\n```sh\n# no es encabezado\n```\ntexto"))
    expect(ranges.filter((r) => r.kind === "heading")).toEqual([
      { start: 1, end: 5, kind: "heading" },
    ])
  })

  it("handles ~~~ fences too", () => {
    const ranges = computeFoldRanges(lines("# Real\n~~~\n# tampoco\n~~~\nx"))
    expect(ranges.filter((r) => r.kind === "heading")).toHaveLength(1)
  })

  it("does not emit a range for a heading with no body", () => {
    expect(computeFoldRanges(lines("# A\n# B"))).toEqual([])
  })

  it("requires a space after the hashes", () => {
    expect(computeFoldRanges(lines("#hashtag\ntexto\nmás"))).toEqual([])
  })

  it("closes a deeper section when a shallower heading appears", () => {
    const ranges = computeFoldRanges(lines("## A1\nx\n# Top\ny"))
    expect(ranges).toContainEqual({ start: 1, end: 2, kind: "heading" })
    expect(ranges).toContainEqual({ start: 3, end: 4, kind: "heading" })
  })
})

describe("splitIntoSections", () => {
  const doc = [
    "---",
    "title: Álgebra",
    "---",
    "",
    "Intro suelta.",
    "",
    "## Clase 1",
    "Derivadas.",
    "",
    "## Clase 2",
    "Integrales.",
  ].join("\n")

  it("splits at the requested heading level", () => {
    const { sections } = splitIntoSections(doc, 2)
    expect(sections.map((s) => s.title)).toEqual(["Clase 1", "Clase 2"])
  })

  it("keeps everything before the first heading as the preamble", () => {
    const { preamble } = splitIntoSections(doc, 2)
    expect(preamble).toContain("title: Álgebra")
    expect(preamble).toContain("Intro suelta.")
    expect(preamble).not.toContain("Clase 1")
  })

  it("includes the heading line in the section text", () => {
    const { sections } = splitIntoSections(doc, 2)
    expect(sections[0].text.startsWith("## Clase 1")).toBe(true)
    expect(sections[0].text).toContain("Derivadas.")
  })

  it("runs the last section to the end of the document", () => {
    const { sections } = splitIntoSections(doc, 2)
    expect(sections[1].text).toContain("Integrales.")
  })

  it("loses no content: preamble plus sections reconstruct the document", () => {
    const { preamble, sections } = splitIntoSections(doc, 2)
    expect([preamble, ...sections.map((s) => s.text)].join("\n")).toBe(doc)
  })

  it("returns no sections when the level is absent", () => {
    const { preamble, sections } = splitIntoSections(doc, 3)
    expect(sections).toEqual([])
    expect(preamble).toBe(doc)
  })

  it("ignores headings inside fenced code", () => {
    const withCode = "## Real\n```\n## falso\n```\ntexto"
    expect(splitIntoSections(withCode, 2).sections).toHaveLength(1)
  })
})

describe("sectionSlug", () => {
  it("folds accents and spaces", () => {
    expect(sectionSlug("Clase 3 — Álgebra Lineal", 0)).toBe("clase-3-algebra-lineal")
  })

  it("trims stray separators", () => {
    expect(sectionSlug("  ¿Qué es?  ", 0)).toBe("que-es")
  })

  it("keeps the letters of a math-only heading rather than discarding it", () => {
    expect(sectionSlug("$$\\int$$", 0)).toBe("int")
  })

  it("falls back to a positional name when nothing survives", () => {
    expect(sectionSlug("— ¿? —", 4)).toBe("seccion-5")
  })
})
