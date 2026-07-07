import { describe, expect, it } from "vitest"
import { parseExpr, parsePlotBlock, renderPlotHTML } from "./functionPlot"

describe("parseExpr — evaluator", () => {
  it("evaluates polynomials", () => {
    expect(parseExpr("x^2")(3)).toBe(9)
    expect(parseExpr("2*x+1")(5)).toBe(11)
    expect(parseExpr("x*x*x")(2)).toBe(8)
  })

  it("evaluates trig functions", () => {
    expect(parseExpr("cos(0)")(0)).toBeCloseTo(1)
    expect(parseExpr("sin(pi/2)")(0)).toBeCloseTo(1)
    expect(parseExpr("tan(0)")(0)).toBeCloseTo(0)
  })

  it("resolves constants pi and e", () => {
    expect(parseExpr("pi")(0)).toBeCloseTo(Math.PI)
    expect(parseExpr("e")(0)).toBeCloseTo(Math.E)
  })

  it("supports the unicode π symbol as pi", () => {
    expect(parseExpr("π")(0)).toBeCloseTo(Math.PI)
  })

  it("evaluates sqrt, abs, and other builtin functions", () => {
    expect(parseExpr("sqrt(16)")(0)).toBe(4)
    expect(parseExpr("abs(-5)")(0)).toBe(5)
    expect(parseExpr("floor(3.7)")(0)).toBe(3)
    expect(parseExpr("ceil(3.2)")(0)).toBe(4)
  })

  it("applies unary minus before the variable is substituted", () => {
    expect(parseExpr("-x")(5)).toBe(-5)
  })

  it("binds unary minus tighter than left operand but pow binds atom first (-x^2 = -(x^2))", () => {
    expect(parseExpr("-x^2")(2)).toBe(-4)
  })

  it("treats ^ as right-associative", () => {
    // 2^3^2 = 2^(3^2) = 2^9 = 512, NOT (2^3)^2 = 64
    expect(parseExpr("2^3^2")(0)).toBe(512)
  })

  it("supports ** as an alias for ^", () => {
    expect(parseExpr("3**2")(0)).toBe(9)
  })

  it("handles division by zero by returning NaN, not throwing", () => {
    const fn = parseExpr("1/x")
    expect(fn(0)).toBeNaN()
    expect(() => fn(0)).not.toThrow()
  })

  it("parses scientific notation", () => {
    expect(parseExpr("1e3")(0)).toBe(1000)
    expect(parseExpr("2.5e-2")(0)).toBeCloseTo(0.025)
  })

  it("respects parentheses for precedence", () => {
    expect(parseExpr("(x+1)*(x-1)")(3)).toBe(8) // (4)*(2)
  })

  it("throws on an unknown function", () => {
    expect(() => parseExpr("foo(2)")).not.toThrow() // parseExpr only compiles, doesn't call
    expect(() => parseExpr("foo(2)")(0)).toThrow(/Unknown function/)
  })

  it("throws on an unknown identifier", () => {
    expect(() => parseExpr("y")).toThrow(/Unknown identifier/)
  })

  it("throws on a malformed / incomplete expression", () => {
    expect(() => parseExpr("2+")).toThrow()
  })

  it("throws on an empty expression", () => {
    expect(() => parseExpr("")).toThrow()
  })

  it("throws on trailing garbage after a valid expression", () => {
    expect(() => parseExpr("2 3")).toThrow()
  })

  it("throws on an unexpected character", () => {
    expect(() => parseExpr("x @ 2")).toThrow(/Unexpected character/)
  })
})

describe("parsePlotBlock", () => {
  it("defaults the domain to [-2pi, 2pi] when no range is given", () => {
    const spec = parsePlotBlock("", "sin(x)")
    expect(spec.xMin).toBeCloseTo(-2 * Math.PI)
    expect(spec.xMax).toBeCloseTo(2 * Math.PI)
  })

  it("parses an explicit range: [min, max] directive", () => {
    const spec = parsePlotBlock("", "range: [-2, 5]\nx^2")
    expect(spec.xMin).toBe(-2)
    expect(spec.xMax).toBe(5)
  })

  it("parses an x: [min, max] directive (alias of range)", () => {
    const spec = parsePlotBlock("", "x: [0, 10]\nx")
    expect(spec.xMin).toBe(0)
    expect(spec.xMax).toBe(10)
  })

  it("parses xmin=/xmax= per-line directives", () => {
    const spec = parsePlotBlock("", "xmin=-3\nxmax=3\nx^2")
    expect(spec.xMin).toBe(-3)
    expect(spec.xMax).toBe(3)
  })

  it("parses a named function f(x) = expr", () => {
    const spec = parsePlotBlock("", "f(x) = x^2")
    expect(spec.fns).toHaveLength(1)
    expect(spec.fns[0].label).toBe("f")
    expect(spec.fns[0].expr).toBe("x^2")
    expect(spec.fns[0].fn(3)).toBe(9)
  })

  it("parses an anonymous expression line, using it as the label", () => {
    const spec = parsePlotBlock("", "sin(x)")
    expect(spec.fns).toHaveLength(1)
    expect(spec.fns[0].label).toBe("sin(x)")
  })

  it("truncates very long anonymous labels with an ellipsis", () => {
    const longExpr = "x^2 + x^2 + x^2 + x^2 + x^2 + x^2 + x^2" // > 30 chars
    const spec = parsePlotBlock("", longExpr)
    expect(spec.fns[0].label.length).toBe(28) // 27 chars + "…"
    expect(spec.fns[0].label.endsWith("…")).toBe(true)
  })

  it("parses multiple function lines into multiple entries", () => {
    const spec = parsePlotBlock("", "f(x) = x\ng(x) = x^2\nh(x) = sin(x)")
    expect(spec.fns.map(f => f.label)).toEqual(["f", "g", "h"])
  })

  it("skips comment lines starting with #", () => {
    const spec = parsePlotBlock("", "# a comment\nf(x) = x\n# another")
    expect(spec.fns).toHaveLength(1)
  })

  it("skips blank lines", () => {
    const spec = parsePlotBlock("", "\n\nf(x) = x\n\n")
    expect(spec.fns).toHaveLength(1)
  })

  it("propagates a parse error for an invalid expression line", () => {
    expect(() => parsePlotBlock("", "f(x) = 2 +")).toThrow()
  })

  it("carries the given title through unchanged", () => {
    const spec = parsePlotBlock("My Title", "x")
    expect(spec.title).toBe("My Title")
  })
})

describe("renderPlotHTML", () => {
  it("returns an error div (no throw) when no functions are defined", () => {
    const html = renderPlotHTML("", "# just a comment", "1")
    expect(html).toContain("plot-error")
    expect(html).toContain("no functions defined")
  })

  it("returns an error div (no throw) for an invalid expression", () => {
    expect(() => renderPlotHTML("", "f(x) = 2 +", "1")).not.toThrow()
    const html = renderPlotHTML("", "f(x) = 2 +", "1")
    expect(html).toContain("plot-error")
    expect(html).toContain("Plot error:")
  })

  it("renders a valid single-function plot as an svg with a polyline", () => {
    const html = renderPlotHTML("", "f(x) = x^2", "1")
    expect(html).toContain("<svg")
    expect(html).toContain("viewBox=")
    expect(html).toContain("<polyline")
  })

  it("renders multiple functions on one plot with distinct colors and a legend entry each", () => {
    const html = renderPlotHTML("", "f(x) = x\ng(x) = x^2\nh(x) = -x", "1")
    const polylineCount = (html.match(/<polyline /g) ?? []).length
    expect(polylineCount).toBeGreaterThanOrEqual(3)
    // Legend: one rect+text swatch per function (colors used as fill on small legend rects)
    expect(html).toContain(">f<")
    expect(html).toContain(">g<")
    expect(html).toContain(">h<")
  })

  it("caps the number of plotted functions at 6", () => {
    const lines = Array.from({ length: 8 }, (_, i) => `f${i}(x) = x + ${i}`)
    const html = renderPlotHTML("", lines.join("\n"), "1")
    // Only the first 6 should appear in the legend
    expect(html).toContain(">f0<")
    expect(html).toContain(">f5<")
    expect(html).not.toContain(">f6<")
    expect(html).not.toContain(">f7<")
  })

  it("does not crash on an asymptote / division-by-zero within the plotted domain", () => {
    expect(() => renderPlotHTML("", "range: [-5, 5]\n1/x", "1")).not.toThrow()
    const html = renderPlotHTML("", "range: [-5, 5]\n1/x", "1")
    expect(html).toContain("<svg")
    // The run should break at the asymptote, producing at least one polyline segment
    expect(html).toContain("<polyline")
  })

  it("does not crash on tan(x), which has multiple asymptotes across the default domain", () => {
    expect(() => renderPlotHTML("", "tan(x)", "1")).not.toThrow()
  })

  it("includes the title in the header when provided", () => {
    const html = renderPlotHTML("My Plot", "x", "2")
    expect(html).toContain("Plot 2: My Plot")
  })

  it("omits the title segment when no title is given", () => {
    const html = renderPlotHTML("", "x", "2")
    expect(html).toContain("Plot 2")
    expect(html).not.toMatch(/Plot 2:/)
  })

  it("escapes HTML-sensitive characters appearing in the title", () => {
    const html = renderPlotHTML("<script>", "x", "1")
    expect(html).toContain("&lt;script&gt;")
    expect(html).not.toContain("<script>")
  })
})
