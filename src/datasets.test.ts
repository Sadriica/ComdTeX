import { beforeEach, describe, expect, it } from "vitest"
import {
  parseDataBlocks,
  loadDataset,
  resolveBlockSource,
  isDatasetRef,
  datasetRefLabel,
  datasetCacheStats,
  clearDatasetCache,
} from "./datasets"
import { resolveDocumentContent } from "./documentResolve"

const CSV = [
  "time,S1,S2,S3,sd",
  "0,0.10,0.12,0.09,0.01",
  "2,0.28,0.31,0.25,0.02",
  "4,0.55,0.60,0.51,0.03",
  "6,0.80,0.88,0.76,0.04",
].join("\n")

const resolver = (t: string) => (t === "growth.csv" ? CSV : null)

beforeEach(() => clearDatasetCache())

describe("parseDataBlocks", () => {
  it("declares a dataset and removes the block from the text", () => {
    const doc = "Before.\n\n:::data{#data:growth}\ngrowth.csv (A:C) (1:3)\n:::\n\nAfter."
    const { datasets, content } = parseDataBlocks(doc)
    expect(datasets.get("data:growth")?.spec.file).toBe("growth.csv")
    expect(datasets.get("data:growth")?.spec.cols).toEqual(["A:C"])
    // The declaration prints nothing.
    expect(content).not.toContain(":::data")
    expect(content).not.toContain("growth.csv")
    expect(content).toContain("Before.")
    expect(content).toContain("After.")
  })

  it("accepts the label on its own line inside the block", () => {
    const { datasets } = parseDataBlocks(":::data\n{#data:grow}\ngrowth.csv\n:::")
    expect(datasets.has("data:grow")).toBe(true)
    expect(datasets.get("data:grow")?.spec.file).toBe("growth.csv")
  })

  it("keeps the first of two declarations with the same name", () => {
    const doc = ":::data{#data:x}\na.csv\n:::\n:::data{#data:x}\nb.csv\n:::"
    const { datasets } = parseDataBlocks(doc)
    expect(datasets.size).toBe(1)
    expect(datasets.get("data:x")?.spec.file).toBe("a.csv")
  })

  it("is a cheap no-op for documents without declarations", () => {
    const doc = "Just prose."
    const { datasets, content } = parseDataBlocks(doc)
    expect(datasets.size).toBe(0)
    expect(content).toBe(doc)
  })
})

describe("loadDataset", () => {
  it("resolves the declared selection", () => {
    const { datasets } = parseDataBlocks(":::data{#data:g}\ngrowth.csv (A:B) (1:2)\n:::")
    const loaded = loadDataset(datasets.get("data:g")!, resolver)
    expect(loaded?.header).toEqual(["time", "S1"])
    expect(loaded?.rows).toEqual([["0", "0.10"], ["2", "0.28"]])
  })

  it("returns null for a missing file instead of throwing", () => {
    const { datasets } = parseDataBlocks(":::data{#data:g}\nmissing.csv\n:::")
    expect(loadDataset(datasets.get("data:g")!, resolver)).toBeNull()
  })

  it("parses a CSV once and reuses it while the source is unchanged", () => {
    const { datasets } = parseDataBlocks(":::data{#data:g}\ngrowth.csv\n:::")
    const decl = datasets.get("data:g")!
    loadDataset(decl, resolver)
    loadDataset(decl, resolver)
    loadDataset(decl, resolver)
    // The resolver returns the same string reference every time.
    expect(datasetCacheStats().parses).toBe(1)
  })

  it("reparses when the file's content actually changes", () => {
    const { datasets } = parseDataBlocks(":::data{#data:g}\ngrowth.csv\n:::")
    const decl = datasets.get("data:g")!
    loadDataset(decl, resolver)
    loadDataset(decl, () => CSV + "\n8,1.00,1.10,0.95,0.05")
    expect(datasetCacheStats().parses).toBe(2)
  })
})

describe("dataset references", () => {
  it("recognizes and strips the @ prefix", () => {
    expect(isDatasetRef("@data:growth")).toBe(true)
    expect(isDatasetRef("growth.csv")).toBe(false)
    expect(datasetRefLabel("@data:growth")).toBe("data:growth")
  })
})

describe("resolveBlockSource", () => {
  const decl = () => parseDataBlocks(":::data{#data:g}\ngrowth.csv (A:C) (1:3)\n:::").datasets

  it("reads a plain file with the block's own selection", () => {
    const { data, error } = resolveBlockSource(
      { file: "growth.csv", cols: ["A"], rows: ["1"], caption: "" },
      new Map(),
      resolver,
    )
    expect(error).toBeNull()
    expect(data?.header).toEqual(["time"])
    expect(data?.rows).toEqual([["0"]])
  })

  it("narrows a dataset with the block's selection", () => {
    // The dataset selected time,S1,S2 for rows 1..3; the block takes the
    // first and third of THOSE columns and the first two of those rows.
    const { data, error } = resolveBlockSource(
      { file: "@data:g", cols: ["A", "C"], rows: ["1:2"], caption: "" },
      decl(),
      resolver,
    )
    expect(error).toBeNull()
    expect(data?.header).toEqual(["time", "S2"])
    expect(data?.rows).toEqual([["0", "0.12"], ["2", "0.31"]])
  })

  it("returns the whole dataset when the block adds no selection", () => {
    const { data } = resolveBlockSource(
      { file: "@data:g", cols: null, rows: null, caption: "" },
      decl(),
      resolver,
    )
    expect(data?.header).toEqual(["time", "S1", "S2"])
    expect(data?.rows).toHaveLength(3)
  })

  it("says which dataset is missing rather than failing quietly", () => {
    const { data, error } = resolveBlockSource(
      { file: "@data:nope", cols: null, rows: null, caption: "" },
      decl(),
      resolver,
    )
    expect(data).toBeNull()
    expect(error).toContain("no dataset with that name")
  })
})

describe("end to end through the document resolver", () => {
  it("a declared dataset feeds a table, and the declaration leaves no trace", () => {
    const doc = [
      ":::data{#data:growth}",
      "growth.csv (A:D) (1:4)",
      ":::",
      "",
      "## Results",
      "",
      ":::csv[Selected]",
      "@data:growth (A, B) (1, 4)",
      ":::",
    ].join("\n")
    const out = resolveDocumentContent(doc, resolver)
    expect(out).not.toContain(":::data")
    expect(out).not.toContain(":::csv")
    expect(out).toContain("**Selected**")
    expect(out).toContain("| time | S1 |")
    expect(out).toContain("| 0 | 0.10 |")
    expect(out).toContain("| 6 | 0.80 |")
    expect(out).not.toContain("0.28")
  })

  it("a generated table can carry a label and stay citable", () => {
    const doc = ":::data{#data:g}\ngrowth.csv\n:::\n\n:::csv[T]{#tbl:growth}\n@data:g (A:B) (1)\n:::"
    const out = resolveDocumentContent(doc, resolver)
    expect(out).toContain("{#tbl:growth}")
  })

  it("reports an undeclared reference in the document itself", () => {
    const out = resolveDocumentContent(":::csv\n@data:ghost\n:::", resolver)
    expect(out).toContain("no dataset with that name")
  })
})
