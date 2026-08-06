import { describe, expect, it } from "vitest"
import {
  findSpecialBlocks,
  truthBlockToMarkdown,
  svgForPrint,
  extractSvg,
  diagramToSvg,
  hasRasterBlocks,
  replaceDiagramsForExport,
} from "./diagramExport"

describe("findSpecialBlocks", () => {
  it("parses type, name and body, and respects code fences", () => {
    const md = [
      "# Doc",
      ":::graph[Mi grafo]",
      "a -> b",
      ":::",
      "```",
      ":::plot",
      "ignored inside fence",
      ":::",
      "```",
      ":::truth",
      "p and q",
      ":::",
    ].join("\n")
    const blocks = findSpecialBlocks(md)
    expect(blocks.map((b) => b.type)).toEqual(["graph", "truth"])
    expect(blocks[0].name).toBe("Mi grafo")
    expect(blocks[0].body).toBe("a -> b")
  })

  it("leaves unclosed blocks alone", () => {
    expect(findSpecialBlocks(":::graph\na -> b")).toEqual([])
  })
})

describe("truthBlockToMarkdown", () => {
  it("renders a real markdown table", () => {
    const table = truthBlockToMarkdown("p and q")
    expect(table).toContain("| p | q | p and q |")
    expect(table).toContain("| V | V | V |")
    expect(table).toContain("| F | F | F |")
  })

  it("returns null on garbage instead of throwing", () => {
    expect(truthBlockToMarkdown("((((")).toBeNull()
  })
})

describe("svgForPrint", () => {
  it("resolves CSS variables to the print palette or the fallback", () => {
    const out = svgForPrint('<svg viewBox="0 0 100 50" width="100%"><rect fill="var(--surface2, #1a1a1a)"/><text fill="var(--unknown, #eee)"/></svg>')
    expect(out).toContain('fill="#f5f5f2"')
    expect(out).toContain('fill="#eee"')
    expect(out).not.toContain("var(")
  })

  it("gives the svg explicit pixel dimensions", () => {
    const out = svgForPrint('<svg viewBox="0 0 320 200" width="100%" xmlns="http://www.w3.org/2000/svg"></svg>')
    expect(out).toContain('width="320"')
    expect(out).toContain('height="200"')
  })
})

describe("diagramToSvg (pure renderers)", () => {
  it("renders a graph block to svg", async () => {
    const svg = await diagramToSvg({ type: "graph", name: "G", info: "", body: "a -> b", start: 0, end: 3 })
    expect(svg).toContain("<svg")
    expect(svg).toContain("</svg>")
  })

  it("renders a commutative diagram to svg", async () => {
    const svg = await diagramToSvg({ type: "commdiag", name: "", info: "", body: "A -> B\nB -> C", start: 0, end: 4 })
    expect(svg).toContain("<svg")
  })

  it("returns null for non-visual types", async () => {
    expect(await diagramToSvg({ type: "pseudocode", name: "", info: "", body: "x", start: 0, end: 3 })).toBeNull()
  })
})

describe("replaceDiagramsForExport", () => {
  it("replaces truth blocks with tables and leaves unrasterizable blocks for the degrader", async () => {
    const md = [
      "intro",
      ":::truth[Tabla]",
      "p or q",
      ":::",
      ":::pseudocode",
      "x <- 1",
      ":::",
    ].join("\n")
    // jsdom has no canvas.toBlob, so raster types would no-op here; truth
    // tables are pure and must land regardless.
    const { content } = await replaceDiagramsForExport(md, async () => "unused.png")
    expect(content).toContain("**Truth Table 1: Tabla**")
    expect(content).toContain("| p | q | p or q |")
    expect(content).toContain(":::pseudocode")
    expect(content).not.toContain(":::truth")
  })

  it("keeps per-type numbering for captions", async () => {
    const md = [":::truth", "p", ":::", ":::truth", "q", ":::"].join("\n")
    const { content } = await replaceDiagramsForExport(md, async () => "unused.png")
    expect(content).toContain("**Truth Table 1**")
    expect(content).toContain("**Truth Table 2**")
  })
})

describe("hasRasterBlocks", () => {
  it("is true only for visual block types", () => {
    expect(hasRasterBlocks(":::graph\na->b\n:::")).toBe(true)
    expect(hasRasterBlocks(":::truth\np\n:::")).toBe(false)
    expect(hasRasterBlocks("plain text")).toBe(false)
  })
})

describe("extractSvg", () => {
  it("pulls the svg out of an html wrapper", () => {
    expect(extractSvg('<div class="x"><svg a="1">y</svg></div>')).toBe('<svg a="1">y</svg>')
    expect(extractSvg("<div>no svg</div>")).toBeNull()
  })
})
