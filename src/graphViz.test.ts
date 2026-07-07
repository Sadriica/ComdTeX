import { describe, expect, it } from "vitest"
import { parseGraph, renderGraphSVG } from "./graphViz"

describe("parseGraph", () => {
  it("parses a directed edge", () => {
    const g = parseGraph("A -> B")
    expect(g.nodes).toEqual(["A", "B"])
    expect(g.edges).toEqual([{ from: "A", to: "B", weight: undefined, directed: true }])
  })

  it("parses an undirected edge", () => {
    const g = parseGraph("A -- B")
    expect(g.edges).toEqual([{ from: "A", to: "B", weight: undefined, directed: false }])
  })

  it("parses a weighted undirected edge", () => {
    const g = parseGraph("A -- B : 4")
    expect(g.edges[0].weight).toBe("4")
    expect(g.edges[0].directed).toBe(false)
  })

  it("parses a weighted directed edge", () => {
    const g = parseGraph("A -> B : 2.3")
    expect(g.edges[0].weight).toBe("2.3")
    expect(g.edges[0].directed).toBe(true)
  })

  it("collects nodes in first-appearance order across multiple edges", () => {
    const g = parseGraph("A -> B\nB -> C\nC -> A")
    expect(g.nodes).toEqual(["A", "B", "C"])
    expect(g.edges).toHaveLength(3)
  })

  it("treats a standalone line with no operator as a node declaration", () => {
    const g = parseGraph("A -> B\nC")
    expect(g.nodes).toEqual(["A", "B", "C"])
    expect(g.edges).toHaveLength(1)
  })

  it("does not duplicate an already-seen standalone node", () => {
    const g = parseGraph("A -> B\nA")
    expect(g.nodes).toEqual(["A", "B"])
  })

  it("returns empty nodes/edges for empty content", () => {
    const g = parseGraph("")
    expect(g.nodes).toEqual([])
    expect(g.edges).toEqual([])
  })

  it("returns empty nodes/edges for whitespace-only content", () => {
    const g = parseGraph("   \n\n\t \n")
    expect(g.nodes).toEqual([])
    expect(g.edges).toEqual([])
  })

  it("handles a self-loop edge", () => {
    const g = parseGraph("A -> A")
    expect(g.nodes).toEqual(["A"])
    expect(g.edges[0]).toEqual({ from: "A", to: "A", weight: undefined, directed: true })
  })
})

describe("renderGraphSVG", () => {
  it("returns an error div for empty content, without throwing", () => {
    const html = renderGraphSVG("", "", "1")
    expect(html).toContain("graph-error")
    expect(html).toContain("empty graph content")
  })

  it("returns an error div for whitespace-only content", () => {
    const html = renderGraphSVG("", "   \n  ", "1")
    expect(html).toContain("graph-error")
  })

  it("renders an svg with one circle per node and a line per edge", () => {
    const html = renderGraphSVG("", "A -> B\nB -> C", "1")
    expect(html).toContain("<svg")
    expect(html).toContain("viewBox=")
    // 2 edges => 2 non-self-loop lines; 3 nodes => 3 node circles
    const lineCount = (html.match(/<line /g) ?? []).length
    expect(lineCount).toBe(2)
    const nodeCircleCount = (html.match(/<circle cx="[\d.]+" cy="[\d.]+" r="18"/g) ?? []).length
    expect(nodeCircleCount).toBe(3)
  })

  it("adds an arrow marker-end for directed edges", () => {
    const html = renderGraphSVG("", "A -> B", "1")
    expect(html).toContain("marker-end=")
  })

  it("does not add a marker-end for undirected edges", () => {
    const html = renderGraphSVG("", "A -- B", "1")
    // no <line ...marker-end> should exist since the only edge is undirected
    const lineWithMarker = /<line[^>]*marker-end/.exec(html)
    expect(lineWithMarker).toBeNull()
  })

  it("renders the edge weight as text", () => {
    const html = renderGraphSVG("", "A -- B : 4", "1")
    expect(html).toContain(">4<")
  })

  it("includes the title in the header when provided", () => {
    const html = renderGraphSVG("My Graph", "A -> B", "3")
    expect(html).toContain("Graph 3: My Graph")
  })

  it("omits the title segment when no title is given", () => {
    const html = renderGraphSVG("", "A -> B", "3")
    expect(html).toContain("Graph 3")
    expect(html).not.toMatch(/Graph 3:/)
  })

  it("renders a disconnected standalone node with no edges", () => {
    const html = renderGraphSVG("", "A -> B\nC", "1")
    const nodeCircleCount = (html.match(/<circle cx="[\d.]+" cy="[\d.]+" r="18"/g) ?? []).length
    expect(nodeCircleCount).toBe(3)
    expect(html).toContain(">C<")
  })

  it("renders a self-loop as a small arc circle rather than a line", () => {
    const html = renderGraphSVG("", "A -> A", "1")
    // self-loop circle uses r = NODE_R * 0.7 = 12.6
    expect(html).toContain('r="12.6"')
    const lineCount = (html.match(/<line /g) ?? []).length
    expect(lineCount).toBe(0)
  })

  it("escapes HTML-sensitive characters in node names and weights", () => {
    const html = renderGraphSVG("", "<A> -> B : <5>", "1")
    expect(html).toContain("&lt;A&gt;")
    expect(html).toContain("&lt;5&gt;")
    expect(html).not.toContain("<A>")
  })

  it("errors gracefully when there are too many nodes (max 20)", () => {
    const lines: string[] = []
    for (let i = 0; i < 21; i++) lines.push(`N${i}`)
    const content = lines.map((n, i) => (i === 0 ? n : `N${i - 1} -> ${n}`)).join("\n")
    const html = renderGraphSVG("", content, "1")
    expect(html).toContain("graph-error")
    expect(html).toContain("too many nodes")
    expect(html).toContain("got 21")
  })

  it("offsets parallel edges between the same pair of nodes", () => {
    // Two edges between A and B should both render without throwing
    const html = renderGraphSVG("", "A -> B\nA -> B", "1")
    const lineCount = (html.match(/<line /g) ?? []).length
    expect(lineCount).toBe(2)
  })

  it("does not throw on a malformed/garbage line mixed with valid edges", () => {
    expect(() => renderGraphSVG("", "A -> B\n!!! not an edge ///", "1")).not.toThrow()
    const html = renderGraphSVG("", "A -> B\n!!! not an edge ///", "1")
    // The garbage line becomes a standalone node since it doesn't match the edge regex
    expect(html).toContain("<svg")
  })
})
