import { beforeEach, describe, expect, it } from "vitest"
import { parsePlotData, expandPlotData } from "./plotData"
import { parseDataBlocks, clearDatasetCache } from "./datasets"
import { parsePlotBlock, renderPlotHTML } from "./functionPlot"
import { resolveDocumentContent } from "./documentResolve"

const CSV = [
  "time,S1,S2,sd",
  "0,0.10,0.12,0.01",
  "2,0.28,0.31,0.02",
  "4,0.55,0.60,0.03",
].join("\n")

const CATEGORICAL = ["condition,mean,sem", "control,1.2,0.1", "treated,2.4,0.2"].join("\n")

const resolver = (t: string) =>
  t === "growth.csv" ? CSV : t === "conds.csv" ? CATEGORICAL : null

const datasetsFrom = (decl: string) => parseDataBlocks(decl).datasets

beforeEach(() => clearDatasetCache())

describe("parsePlotData", () => {
  it("reads a dataset reference and the column directives", () => {
    const spec = parsePlotData("@data:g\nx: time\ny: (S1, S2)\nkind: scatter\nerror: sd")
    expect(spec).toMatchObject({
      source: "@data:g",
      xSel: "time",
      ySel: ["S1", "S2"],
      kind: "scatter",
      errSel: "sd",
    })
  })

  it("returns null for a classic function plot, which must pass through", () => {
    expect(parsePlotData("f(x) = sin(x)\nrange: [-3, 3]")).toBeNull()
  })

  it("does not mistake an x range for a column selector", () => {
    const spec = parsePlotData("@data:g\nx: [-2, 5]")
    expect(spec?.xSel).toBeNull()
    expect(spec?.rest).toContain("x: [-2, 5]")
  })

  it("accepts a direct csv file as the source", () => {
    expect(parsePlotData("data: growth.csv")?.source).toBe("growth.csv")
  })
})

describe("expandPlotData", () => {
  const datasets = () => datasetsFrom(":::data{#data:g}\ngrowth.csv\n:::")

  it("rewrites a dataset reference into literal series", () => {
    const out = expandPlotData(":::plot[Growth]\n@data:g\nx: time\ny: (S1, S2)\n:::", datasets(), resolver)
    expect(out).toContain("series S1: 0,0.1 2,0.28 4,0.55")
    expect(out).toContain("series S2: 0,0.12 2,0.31 4,0.6")
    expect(out).toContain("xlabel: time")
    expect(out).not.toContain("@data:g")
  })

  it("defaults to every column except x, so the common case needs no directives", () => {
    const out = expandPlotData(":::plot\n@data:g\n:::", datasets(), resolver)
    expect(out).toContain("series S1:")
    expect(out).toContain("series S2:")
    expect(out).toContain("series sd:")
  })

  it("attaches error bars from the named column and keeps it out of the series", () => {
    const out = expandPlotData(":::plot\n@data:g\nx: time\nerror: sd\n:::", datasets(), resolver)
    expect(out).toContain("series S1: 0,0.1,0.01 2,0.28,0.02 4,0.55,0.03")
    expect(out).not.toContain("series sd:")
  })

  it("carries the kind through", () => {
    const out = expandPlotData(":::plot\n@data:g\nkind: bars\n:::", datasets(), resolver)
    expect(out).toContain("kind: bars")
  })

  it("turns a non-numeric x column into categories", () => {
    const ds = datasetsFrom(":::data{#data:c}\nconds.csv\n:::")
    const out = expandPlotData(":::plot\n@data:c\nx: condition\ny: mean\nkind: bars\n:::", ds, resolver)
    expect(out).toContain("categories: control | treated")
    expect(out).toContain("series mean: 1,1.2 2,2.4")
  })

  it("says so when the dataset does not exist", () => {
    const out = expandPlotData(":::plot[P]\n@data:ghost\n:::", new Map(), resolver)
    expect(out).toContain("no dataset with that name")
    expect(out).not.toContain(":::plot")
  })

  it("says so when the requested columns do not exist", () => {
    const out = expandPlotData(":::plot\n@data:g\nx: nope\ny: (alsonope)\n:::", datasets(), resolver)
    expect(out).toContain("do not exist")
  })

  it("leaves a function plot untouched", () => {
    const block = ":::plot\nf(x) = sin(x)\n:::"
    expect(expandPlotData(block, datasets(), resolver)).toBe(block)
  })
})

describe("the expanded block renders", () => {
  const expand = (body: string, decl = ":::data{#data:g}\ngrowth.csv\n:::") =>
    expandPlotData(body, datasetsFrom(decl), resolver)

  it("parses back into a spec with real series", () => {
    const out = expand(":::plot\n@data:g\nx: time\ny: (S1)\nerror: sd\n:::")
    const body = out.replace(/^:::plot(\[[^\]]*\])?\n/, "").replace(/\n:::$/, "")
    const spec = parsePlotBlock("", body)
    expect(spec.series).toHaveLength(1)
    expect(spec.series[0].label).toBe("S1")
    expect(spec.series[0].points).toEqual([
      { x: 0, y: 0.1, err: 0.01 },
      { x: 2, y: 0.28, err: 0.02 },
      { x: 4, y: 0.55, err: 0.03 },
    ])
    // The x range follows the data instead of the default trig window.
    expect(spec.xMin).toBeLessThan(0)
    expect(spec.xMax).toBeGreaterThan(4)
  })

  it("draws markers and error bars for a line series", () => {
    const out = expand(":::plot\n@data:g\nx: time\ny: (S1)\nerror: sd\n:::")
    const body = out.replace(/^:::plot(\[[^\]]*\])?\n/, "").replace(/\n:::$/, "")
    const svg = renderPlotHTML("", body)
    expect(svg).toContain("<polyline")
    expect(svg).toContain("<circle")
    expect(svg).toContain(">time</text>") // the x axis carries the column name
    expect(svg.match(/<line /g)?.length ?? 0).toBeGreaterThan(6) // grid + error caps
  })

  it("draws rectangles for bars and no polyline", () => {
    const ds = ":::data{#data:c}\nconds.csv\n:::"
    const out = expandPlotData(":::plot\n@data:c\nx: condition\ny: mean\nkind: bars\nerror: sem\n:::", datasetsFrom(ds), resolver)
    const body = out.replace(/^:::plot(\[[^\]]*\])?\n/, "").replace(/\n:::$/, "")
    const svg = renderPlotHTML("", body)
    expect(svg).toContain("<rect")
    expect(svg).not.toContain("<polyline")
  })

  it("draws only markers for scatter", () => {
    const out = expand(":::plot\n@data:g\nx: time\ny: (S1)\nkind: scatter\n:::")
    const body = out.replace(/^:::plot(\[[^\]]*\])?\n/, "").replace(/\n:::$/, "")
    const svg = renderPlotHTML("", body)
    expect(svg).toContain("<circle")
    expect(svg).not.toContain("<polyline")
  })

  it("still renders a plain function plot", () => {
    const svg = renderPlotHTML("", "f(x) = sin(x)")
    expect(svg).toContain("<polyline")
    expect(svg).not.toContain("<circle")
  })
})

describe("end to end through the document resolver", () => {
  it("declares data once and plots it", () => {
    const doc = [
      ":::data{#data:growth}",
      "growth.csv",
      ":::",
      "",
      ":::plot[Growth by strain]",
      "@data:growth",
      "x: time",
      "y: (S1, S2)",
      "error: sd",
      ":::",
    ].join("\n")
    const out = resolveDocumentContent(doc, resolver)
    expect(out).not.toContain(":::data")
    expect(out).toContain("series S1: 0,0.1,0.01")
    expect(out).toContain("series S2:")
    expect(out).toContain(":::plot[Growth by strain]")
  })
})
