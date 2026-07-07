import { describe, expect, it } from "vitest"
import { layoutDAG, parseCommDiag, renderCommDiagSVG } from "./commDiag"

describe("parseCommDiag", () => {
  it("parses a single labeled edge", () => {
    const g = parseCommDiag("A -> B [f]")
    expect(g.nodes.map(n => n.id)).toEqual(["A", "B"])
    expect(g.edges).toEqual([{ from: "A", to: "B", label: "f", style: "->" }])
  })

  it("parses an edge with no label", () => {
    const g = parseCommDiag("A -> B")
    expect(g.edges[0].label).toBeUndefined()
  })

  it("parses a 2x2 commutative square with all four labeled edges", () => {
    const content = "A -> B [f]\nA -> C [g]\nB -> D [h]\nC -> D [k]"
    const g = parseCommDiag(content)
    expect(g.nodes.map(n => n.id).sort()).toEqual(["A", "B", "C", "D"])
    expect(g.edges).toHaveLength(4)
    expect(g.edges.map(e => e.label)).toEqual(["f", "g", "h", "k"])
  })

  it("parses every supported arrow style", () => {
    const styles = ["->", "<-", "<->", "->>", ">->", "==>"]
    for (const style of styles) {
      const g = parseCommDiag(`A ${style} B`)
      expect(g.edges).toHaveLength(1)
      expect(g.edges[0].style).toBe(style)
    }
  })

  it("skips comment lines (// and #)", () => {
    const g = parseCommDiag("// a comment\n# another\nA -> B")
    expect(g.edges).toHaveLength(1)
  })

  it("skips blank lines", () => {
    const g = parseCommDiag("\n\nA -> B\n\n")
    expect(g.edges).toHaveLength(1)
  })

  it("silently skips a malformed row that doesn't match the edge grammar", () => {
    const g = parseCommDiag("A -> B [f]\nthis is not an edge\nB -> C [g]")
    expect(g.edges).toHaveLength(2)
    expect(g.nodes.map(n => n.id)).toEqual(["A", "B", "C"])
  })

  it("returns empty nodes/edges for empty content", () => {
    const g = parseCommDiag("")
    expect(g.nodes).toEqual([])
    expect(g.edges).toEqual([])
  })

  it("does not duplicate a node seen in multiple edges", () => {
    const g = parseCommDiag("A -> B\nA -> C")
    expect(g.nodes.map(n => n.id)).toEqual(["A", "B", "C"])
  })
})

describe("layoutDAG", () => {
  it("returns an empty map for an empty graph", () => {
    const positions = layoutDAG({ nodes: [], edges: [] })
    expect(positions.size).toBe(0)
  })

  it("lays out a simple chain left-to-right with increasing x per layer", () => {
    const g = parseCommDiag("A -> B\nB -> C")
    const positions = layoutDAG(g)
    const xA = positions.get("A")!.x
    const xB = positions.get("B")!.x
    const xC = positions.get("C")!.x
    expect(xA).toBeLessThan(xB)
    expect(xB).toBeLessThan(xC)
  })

  it("exposes canvas width/height via the __width__/__height__ sentinel keys", () => {
    const g = parseCommDiag("A -> B\nB -> C\nA -> D")
    const positions = layoutDAG(g)
    expect(positions.has("__width__")).toBe(true)
    expect(positions.has("__height__")).toBe(true)
    expect(positions.get("__width__")!.x).toBeGreaterThan(0)
    expect(positions.get("__height__")!.y).toBeGreaterThan(0)
  })

  it("places nodes in the same layer at the same x coordinate (2x2 square)", () => {
    const content = "A -> B [f]\nA -> C [g]\nB -> D [h]\nC -> D [k]"
    const g = parseCommDiag(content)
    const positions = layoutDAG(g)
    // A is the sole source (layer 0), D is the sole sink (last layer);
    // B and C are both one step from A, so they should share a layer/x.
    expect(positions.get("B")!.x).toBe(positions.get("C")!.x)
    expect(positions.get("A")!.x).toBeLessThan(positions.get("B")!.x)
    expect(positions.get("B")!.x).toBeLessThan(positions.get("D")!.x)
    // Same layer, different nodes => different y (stacked vertically)
    expect(positions.get("B")!.y).not.toBe(positions.get("C")!.y)
  })

  it("does not infinite-loop on a cycle (breaks it and still lays out every node)", () => {
    const g = parseCommDiag("A -> B\nB -> C\nC -> A")
    expect(() => layoutDAG(g)).not.toThrow()
    const positions = layoutDAG(g)
    expect(positions.has("A")).toBe(true)
    expect(positions.has("B")).toBe(true)
    expect(positions.has("C")).toBe(true)
  })

  it("treats a self-loop edge as excluded from layer computation but keeps the node", () => {
    const g = parseCommDiag("A -> A")
    const positions = layoutDAG(g)
    expect(positions.has("A")).toBe(true)
  })
})

describe("renderCommDiagSVG", () => {
  it("returns an error div (no throw) when there are no nodes", () => {
    const html = renderCommDiagSVG("", "", "1")
    expect(html).toContain("commdiag-error")
    expect(html).toContain("no nodes found")
  })

  it("returns an error div (no throw) for a malformed-only input", () => {
    expect(() => renderCommDiagSVG("", "not a valid line at all", "1")).not.toThrow()
    const html = renderCommDiagSVG("", "not a valid line at all", "1")
    expect(html).toContain("commdiag-error")
  })

  it("renders a valid 2x2 square with an ellipse per node and a line per edge, plus labels", () => {
    const content = "A -> B [f]\nA -> C [g]\nB -> D [h]\nC -> D [k]"
    const html = renderCommDiagSVG("", content, "1")
    expect(html).toContain("<svg")
    const ellipseCount = (html.match(/<ellipse /g) ?? []).length
    expect(ellipseCount).toBe(4)
    // Filter to edge lines (they always carry a marker-end attribute); the
    // defs block also defines an unrelated <line> inside the >-> tail marker.
    const lineCount = (html.match(/<line[^>]*marker-end/g) ?? []).length
    expect(lineCount).toBe(4)
    expect(html).toContain(">f<")
    expect(html).toContain(">g<")
    expect(html).toContain(">h<")
    expect(html).toContain(">k<")
  })

  it("renders each node id as text inside an ellipse", () => {
    const html = renderCommDiagSVG("", "A -> B [f]", "1")
    expect(html).toContain(">A<")
    expect(html).toContain(">B<")
  })

  it("renders a self-loop as a path with an arrow marker, not a line", () => {
    const html = renderCommDiagSVG("", "A -> A [loop]", "1")
    expect(html).toContain("<path ")
    expect(html).toContain(">loop<")
  })

  it("uses a double-headed marker for the ->> style", () => {
    const html = renderCommDiagSVG("", "A ->> B", "1")
    expect(html).toContain("cd-dbl-")
  })

  it("uses a bidirectional start+end marker for the <-> style", () => {
    const html = renderCommDiagSVG("", "A <-> B", "1")
    expect(html).toContain("cd-bistart-")
    expect(html).toContain("cd-arr-")
  })

  it("renders the ==> style as two parallel strokes (extra stroke line)", () => {
    const html = renderCommDiagSVG("", "A ==> B", "1")
    expect(html).toContain("cd-double-")
    // extraStroke line + main line => at least 2 <line ...> elements for a single edge
    const lineCount = (html.match(/<line /g) ?? []).length
    expect(lineCount).toBeGreaterThanOrEqual(2)
  })

  it("errors gracefully when there are too many nodes (max 15)", () => {
    const lines: string[] = []
    for (let i = 0; i < 16; i++) lines.push(`N${i} -> N${i + 1}`)
    const html = renderCommDiagSVG("", lines.join("\n"), "1")
    expect(html).toContain("commdiag-error")
    expect(html).toContain("too many nodes")
  })

  it("includes the title in the header when provided", () => {
    const html = renderCommDiagSVG("My Square", "A -> B", "4")
    expect(html).toContain("Diagram 4: My Square")
  })

  it("omits the title segment when no title is given", () => {
    const html = renderCommDiagSVG("", "A -> B", "4")
    expect(html).toContain("Diagram 4")
    expect(html).not.toMatch(/Diagram 4:/)
  })

  it("escapes HTML-sensitive characters in edge labels (node ids are restricted to \\w+ by the grammar)", () => {
    const html = renderCommDiagSVG("", "A -> B [<script>]", "1")
    expect(html).toContain("&lt;script&gt;")
    expect(html).not.toContain("<script>")
  })
})
