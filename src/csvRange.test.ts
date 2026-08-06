import { describe, expect, it } from "vitest"
import {
  lettersToIndex,
  indexToLetters,
  splitSelector,
  resolveColumns,
  resolveRows,
  parseCsv,
  sniffDelimiter,
  parseCsvBlock,
  selectCsv,
  csvToMarkdownTable,
  renderCsvSelection,
} from "./csvRange"

const CSV = [
  "sample,od600,ph,temp,note",
  "S1,0.42,7.1,37,ok",
  "S2,0.51,7.0,37,ok",
  "S3,0.38,6.9,30,slow",
  "S4,0.60,7.2,37,ok",
].join("\n")

describe("column letters", () => {
  it("maps letters to indices and back", () => {
    expect(lettersToIndex("A")).toBe(0)
    expect(lettersToIndex("Z")).toBe(25)
    expect(lettersToIndex("AA")).toBe(26)
    expect(indexToLetters(0)).toBe("A")
    expect(indexToLetters(26)).toBe("AA")
  })
})

describe("splitSelector", () => {
  it("accepts bare atoms and parenthesised lists", () => {
    expect(splitSelector("A:B")).toEqual(["A:B"])
    expect(splitSelector("(A, C, F)")).toEqual(["A", "C", "F"])
    expect(splitSelector("(1:3, 7, 9:12)")).toEqual(["1:3", "7", "9:12"])
  })
})

describe("resolveColumns", () => {
  const header = ["sample", "od600", "ph", "temp", "note"]

  it("expands letter ranges", () => {
    expect(resolveColumns(["A:C"], header)).toEqual([0, 1, 2])
  })

  it("supports non-contiguous selections", () => {
    expect(resolveColumns(["A", "C", "E"], header)).toEqual([0, 2, 4])
    expect(resolveColumns(["A:B", "E"], header)).toEqual([0, 1, 4])
  })

  it("resolves header names, case-insensitively", () => {
    expect(resolveColumns(["sample", "PH"], header)).toEqual([0, 2])
  })

  it("accepts numeric indices, 1-based", () => {
    expect(resolveColumns(["2:3"], header)).toEqual([1, 2])
  })

  it("preserves the written order, so a selection can reorder", () => {
    expect(resolveColumns(["C", "A"], header)).toEqual([2, 0])
  })

  it("null means every column", () => {
    expect(resolveColumns(null, header)).toEqual([0, 1, 2, 3, 4])
  })

  it("ignores out-of-range and unknown atoms instead of throwing", () => {
    expect(resolveColumns(["Z", "nope"], header)).toEqual([])
  })
})

describe("resolveRows", () => {
  it("expands ranges and lists, 1-based over data rows", () => {
    expect(resolveRows(["1:3"], 4)).toEqual([0, 1, 2])
    expect(resolveRows(["1", "4"], 4)).toEqual([0, 3])
    expect(resolveRows(["1:2", "4"], 4)).toEqual([0, 1, 3])
  })

  it("clamps to what exists and never duplicates", () => {
    expect(resolveRows(["1:99"], 3)).toEqual([0, 1, 2])
    expect(resolveRows(["2", "2"], 3)).toEqual([1])
  })

  it("null means every row", () => {
    expect(resolveRows(null, 3)).toEqual([0, 1, 2])
  })
})

describe("parseCsv", () => {
  it("handles quotes, escaped quotes and embedded separators", () => {
    const rows = parseCsv('a,b\n"x,1","he said ""hi"""')
    expect(rows[1]).toEqual(["x,1", 'he said "hi"'])
  })

  it("sniffs semicolons and tabs", () => {
    expect(sniffDelimiter("a;b;c\n1;2;3")).toBe(";")
    expect(sniffDelimiter("a\tb\n1\t2")).toBe("\t")
    expect(parseCsv("a;b\n1;2")[1]).toEqual(["1", "2"])
  })
})

describe("parseCsvBlock", () => {
  it("parses the compact form with both selectors", () => {
    expect(parseCsvBlock("data.csv (A:B, D) (1:8, 12)", "Growth")).toEqual({
      file: "data.csv",
      cols: ["A:B", "D"],
      rows: ["1:8", "12"],
      caption: "Growth",
    })
  })

  it("treats a missing selector as everything", () => {
    expect(parseCsvBlock("data.csv")).toMatchObject({ file: "data.csv", cols: null, rows: null })
    expect(parseCsvBlock("data.csv (A:C)")).toMatchObject({ cols: ["A:C"], rows: null })
  })

  it("parses bare selectors without parentheses", () => {
    expect(parseCsvBlock("data.csv A:B 1:8")).toMatchObject({
      file: "data.csv",
      cols: ["A:B"],
      rows: ["1:8"],
    })
  })

  it("parses the readable key/value form", () => {
    expect(parseCsvBlock("file: data.csv\ncols: A, C\nrows: 1:5")).toMatchObject({
      file: "data.csv",
      cols: ["A", "C"],
      rows: ["1:5"],
    })
  })

  it("returns null for an empty or fileless body", () => {
    expect(parseCsvBlock("")).toBeNull()
    expect(parseCsvBlock("cols: A")).toBeNull()
  })
})

describe("selectCsv and rendering", () => {
  it("selects a rectangle and renders a Markdown table", () => {
    const spec = parseCsvBlock("d.csv (A:B) (1:2)", "Muestras")!
    const out = renderCsvSelection(CSV, spec)
    expect(out).toContain("**Muestras**")
    expect(out).toContain("| sample | od600 |")
    expect(out).toContain("| S1 | 0.42 |")
    expect(out).toContain("| S2 | 0.51 |")
    expect(out).not.toContain("S3")
    expect(out).not.toContain("ph")
  })

  it("selects non-contiguous columns and rows", () => {
    const spec = parseCsvBlock("d.csv (A, C) (1, 4)")!
    const out = renderCsvSelection(CSV, spec)
    expect(out).toContain("| sample | ph |")
    expect(out).toContain("| S1 | 7.1 |")
    expect(out).toContain("| S4 | 7.2 |")
    expect(out).not.toContain("S2")
    expect(out).not.toContain("od600")
  })

  it("escapes pipes so a cell cannot break the table", () => {
    const out = renderCsvSelection('a,b\n"x|y",2', { file: "x", cols: null, rows: null, caption: "" })
    expect(out).toContain("x\\|y")
  })

  it("renders an empty table as empty string rather than a broken one", () => {
    expect(csvToMarkdownTable([], [])).toBe("")
  })

  it("can attach a label for cross-references", () => {
    const out = csvToMarkdownTable(["a"], [["1"]], { label: "tbl:datos" })
    expect(out.trimEnd().endsWith("{#tbl:datos}")).toBe(true)
  })

  it("selectCsv survives a ragged row without throwing", () => {
    const table = parseCsv("a,b,c\n1,2")
    const { rows } = selectCsv(table, { cols: ["A:C"], rows: null })
    expect(rows[0]).toEqual(["1", "2", ""])
  })
})

describe("expandCsvBlocks", () => {
  const resolver = (t: string) => (t === "d.csv" ? CSV : null)

  it("replaces the block with the selected table", async () => {
    const { expandCsvBlocks } = await import("./csvRange")
    const out = expandCsvBlocks(":::csv[Datos]\nd.csv (A:B) (1:2)\n:::", resolver)
    expect(out).toContain("| sample | od600 |")
    expect(out).toContain("| S2 | 0.51 |")
    expect(out).not.toContain(":::csv")
  })

  it("says so when the file is missing instead of rendering nothing", async () => {
    const { expandCsvBlocks } = await import("./csvRange")
    const out = expandCsvBlocks(":::csv\nmissing.csv\n:::", resolver)
    expect(out).toContain("not found")
    expect(out).not.toContain(":::csv")
  })

  it("is a no-op without a resolver or without blocks", async () => {
    const { expandCsvBlocks } = await import("./csvRange")
    expect(expandCsvBlocks(":::csv\nd.csv\n:::")).toContain(":::csv")
    expect(expandCsvBlocks("plain text", resolver)).toBe("plain text")
  })

  it("expands several blocks in one document", async () => {
    const { expandCsvBlocks } = await import("./csvRange")
    const doc = ":::csv\nd.csv (A) (1)\n:::\n\ntext\n\n:::csv\nd.csv (C) (2)\n:::"
    const out = expandCsvBlocks(doc, resolver)
    expect(out).toContain("| S1 |")
    expect(out).toContain("| 7.0 |")
    expect(out).not.toContain(":::csv")
  })
})
