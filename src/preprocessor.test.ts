import { describe, it, expect } from "vitest"
import { preprocess } from "./preprocessor"

describe("preprocess — shorthands outside math (auto-wrap in $...$)", () => {
  it("wraps frac in $...$", () => {
    expect(preprocess("frac(1, 2)")).toBe("$\\frac{1}{2}$")
  })

  it("wraps sqrt in $...$", () => {
    expect(preprocess("sqrt(x)")).toBe("$\\sqrt{x}$")
  })

  it("wraps vec in $...$", () => {
    expect(preprocess("vec(v)")).toBe("$\\vec{v}$")
  })

  it("wraps abs in $...$", () => {
    expect(preprocess("abs(x - 1)")).toBe("$\\left|x - 1\\right|$")
  })

  it("wraps norm in $...$", () => {
    expect(preprocess("norm(v)")).toBe("$\\left\\|v\\right\\|$")
  })

  it("wraps sum with bounds", () => {
    expect(preprocess("sum(i=0, n)")).toBe("$\\sum_{i=0}^{n}$")
  })

  it("wraps int with bounds", () => {
    expect(preprocess("int(a, b)")).toBe("$\\int_{a}^{b}$")
  })

  it("wraps lim", () => {
    expect(preprocess("lim(x, 0)")).toBe("$\\lim_{x \\to 0}$")
  })

  it("wraps derivatives: der and pder", () => {
    expect(preprocess("der(f, x)")).toBe("$\\frac{df}{dx}$")
    expect(preprocess("pder(u, t)")).toBe("$\\frac{\\partial u}{\\partial t}$")
  })

  it("wraps math fonts: bf, cal, bb", () => {
    expect(preprocess("bf(v)")).toBe("$\\mathbf{v}$")
    expect(preprocess("cal(A)")).toBe("$\\mathcal{A}$")
    expect(preprocess("bb(R)")).toBe("$\\mathbb{R}$")
  })

  it("wraps linear algebra: inv and trans", () => {
    expect(preprocess("inv(A)")).toBe("$A^{-1}$")
    expect(preprocess("trans(A)")).toBe("$A^{\\top}$")
  })

  it("leaves plain text untouched", () => {
    expect(preprocess("Hello world")).toBe("Hello world")
  })
})

describe("preprocess — shorthands inside $...$ (no wrap)", () => {
  it("expands frac inside inline math", () => {
    expect(preprocess("$frac(a, b)$")).toBe("$\\frac{a}{b}$")
  })

  it("expands sqrt inside inline math", () => {
    expect(preprocess("$sqrt(x)$")).toBe("$\\sqrt{x}$")
  })

  it("expands inside display math $$...$$", () => {
    expect(preprocess("$$frac(1, n)$$")).toBe("$$\\frac{1}{n}$$")
  })

  it("leaves normal LaTeX inside math untouched", () => {
    expect(preprocess("$\\alpha + \\beta$")).toBe("$\\alpha + \\beta$")
  })
})

describe("preprocess — nesting", () => {
  it("nests frac(sqrt(x), abs(y))", () => {
    expect(preprocess("frac(sqrt(x), abs(y))")).toBe("$\\frac{\\sqrt{x}}{\\left|y\\right|}$")
  })

  it("nests inside math: frac(sqrt(x), 1)", () => {
    expect(preprocess("$frac(sqrt(x), 1)$")).toBe("$\\frac{\\sqrt{x}}{1}$")
  })
})

describe("preprocess — table shorthand", () => {
  it("generates a markdown table header", () => {
    const out = preprocess("table(A, B, C)")
    expect(out).toContain("| A | B | C |")
    expect(out).toContain("| --- | --- | --- |")
  })

  it("table with two columns", () => {
    const out = preprocess("table(X, Y)")
    expect(out).toContain("| X | Y |")
  })
})

describe("preprocess — matrix shorthands", () => {
  it("mat with 4 values → 2×2", () => {
    const out = preprocess("mat(1, 0, 0, 1)")
    expect(out).toContain("\\begin{bmatrix}")
    expect(out).toContain("1 & 0")
    expect(out).toContain("\\end{bmatrix}")
  })

  it("matf(2, 2, a, b, c, d) → 2×2 explicit", () => {
    const out = preprocess("matf(2, 2, a, b, c, d)")
    expect(out).toContain("a & b")
    expect(out).toContain("c & d")
  })
})

describe("preprocess — sup / sub", () => {
  it("sup(x, n) → x^{n}", () => {
    expect(preprocess("sup(x, n)")).toBe("$x^{n}$")
  })

  it("sub(x, i) → x_{i}", () => {
    expect(preprocess("sub(x, i)")).toBe("$x_{i}$")
  })
})

describe("preprocess — decorators", () => {
  it("hat, bar, tilde, dot, ddot", () => {
    expect(preprocess("hat(x)")).toBe("$\\hat{x}$")
    expect(preprocess("bar(x)")).toBe("$\\overline{x}$")
    expect(preprocess("tilde(x)")).toBe("$\\tilde{x}$")
    expect(preprocess("dot(x)")).toBe("$\\dot{x}$")
    expect(preprocess("ddot(x)")).toBe("$\\ddot{x}$")
  })
})

describe("preprocess — robustness", () => {
  it("unclosed paren: does not throw, copies as-is", () => {
    expect(() => preprocess("frac(a, b")).not.toThrow()
  })

  it("empty text returns empty string", () => {
    expect(preprocess("")).toBe("")
  })

  it("multiple shorthands in the same line", () => {
    const out = preprocess("vec(a) + norm(b)")
    expect(out).toContain("\\vec{a}")
    expect(out).toContain("\\left\\|b\\right\\|")
  })
})
