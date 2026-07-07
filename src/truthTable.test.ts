import { describe, expect, it } from "vitest"
import {
  parseBoolExpr,
  evalExpr,
  extractVars,
  buildTruthTable,
  renderTruthTableHTML,
} from "./truthTable"

// ── parseBoolExpr / evalExpr ────────────────────────────────────────────────

describe("parseBoolExpr + evalExpr", () => {
  it("evaluates a bare variable", () => {
    const ast = parseBoolExpr("p")
    expect(evalExpr(ast, { p: true })).toBe(true)
    expect(evalExpr(ast, { p: false })).toBe(false)
  })

  it("supports unicode operators: ¬ ∧ ∨ → ↔", () => {
    expect(evalExpr(parseBoolExpr("¬p"), { p: true })).toBe(false)
    expect(evalExpr(parseBoolExpr("p ∧ q"), { p: true, q: false })).toBe(false)
    expect(evalExpr(parseBoolExpr("p ∨ q"), { p: true, q: false })).toBe(true)
    expect(evalExpr(parseBoolExpr("p → q"), { p: true, q: false })).toBe(false)
    expect(evalExpr(parseBoolExpr("p ↔ q"), { p: true, q: true })).toBe(true)
  })

  it("supports ASCII aliases: ! && || -> <->", () => {
    expect(evalExpr(parseBoolExpr("!p"), { p: true })).toBe(false)
    expect(evalExpr(parseBoolExpr("p && q"), { p: true, q: false })).toBe(false)
    expect(evalExpr(parseBoolExpr("p || q"), { p: true, q: false })).toBe(true)
    expect(evalExpr(parseBoolExpr("p -> q"), { p: true, q: false })).toBe(false)
    expect(evalExpr(parseBoolExpr("p <-> q"), { p: false, q: false })).toBe(true)
  })

  it("supports word-form operators (case-insensitive)", () => {
    expect(evalExpr(parseBoolExpr("p AND q"), { p: true, q: true })).toBe(true)
    expect(evalExpr(parseBoolExpr("p OR q"), { p: false, q: false })).toBe(false)
    expect(evalExpr(parseBoolExpr("NOT p"), { p: true })).toBe(false)
    expect(evalExpr(parseBoolExpr("p IMPLIES q"), { p: true, q: false })).toBe(false)
    expect(evalExpr(parseBoolExpr("p IFF q"), { p: true, q: false })).toBe(false)
  })

  it("respects precedence: ¬ > ∧ > ∨ > → > ↔", () => {
    // p ∨ q ∧ r  ==  p ∨ (q ∧ r)
    const ast = parseBoolExpr("p ∨ q ∧ r")
    expect(evalExpr(ast, { p: false, q: true, r: false })).toBe(false) // false ∨ (true∧false)=false
    expect(evalExpr(ast, { p: false, q: true, r: true })).toBe(true)   // false ∨ (true∧true)=true
  })

  it("parentheses override default precedence", () => {
    const withParens = parseBoolExpr("(p ∨ q) ∧ r")
    const withoutParens = parseBoolExpr("p ∨ q ∧ r")
    const assignment = { p: true, q: false, r: false }
    // (T∨F)∧F = F
    expect(evalExpr(withParens, assignment)).toBe(false)
    // T∨(F∧F) = T
    expect(evalExpr(withoutParens, assignment)).toBe(true)
  })

  it("→ and ↔ chain left-to-right at their own precedence level", () => {
    // p → q → r parses as (p→q)→r given left-associative loop in parseImplies
    const ast = parseBoolExpr("p -> q -> r")
    // (T->F)=F, F->F(r)=T
    expect(evalExpr(ast, { p: true, q: false, r: false })).toBe(true)
  })

  it("throws on an unassigned variable", () => {
    const ast = parseBoolExpr("p ∧ q")
    expect(() => evalExpr(ast, { p: true })).toThrow(/Unassigned variable/)
  })

  it("throws on malformed input (tokenizer/parser errors)", () => {
    expect(() => parseBoolExpr("p &&")).toThrow()
    expect(() => parseBoolExpr("(p ∧ q")).toThrow()
    expect(() => parseBoolExpr("p @ q")).toThrow(/Unexpected character/)
  })
})

// ── extractVars ──────────────────────────────────────────────────────────────

describe("extractVars", () => {
  it("returns variables in order of first appearance, de-duplicated", () => {
    const ast = parseBoolExpr("q ∧ p ∨ q ∧ r")
    expect(extractVars(ast)).toEqual(["q", "p", "r"])
  })

  it("returns a single-element list for one variable used multiple times", () => {
    const ast = parseBoolExpr("p ∧ p ∨ ¬p")
    expect(extractVars(ast)).toEqual(["p"])
  })
})

// ── buildTruthTable ──────────────────────────────────────────────────────────

describe("buildTruthTable", () => {
  it("produces 2^n rows in canonical descending binary order for n vars", () => {
    const table = buildTruthTable(["p ∧ q"])
    expect(table.vars).toEqual(["p", "q"])
    expect(table.rows).toHaveLength(4)
    // canonical order: TT, TF, FT, FF
    expect(table.rows.map(r => [r[0], r[1]])).toEqual([
      [true, true],
      [true, false],
      [false, true],
      [false, false],
    ])
    // last column is p ∧ q
    expect(table.rows.map(r => r[2])).toEqual([true, false, false, false])
  })

  it("collects variables across multiple expressions without duplicates", () => {
    const table = buildTruthTable(["p ∧ q", "q ∨ r"])
    expect(table.vars).toEqual(["p", "q", "r"])
    expect(table.rows).toHaveLength(8)
    expect(table.exprs).toEqual(["p ∧ q", "q ∨ r"])
    // each row has vars.length + exprs.length columns
    expect(table.rows[0]).toHaveLength(5)
  })

  it("recognizes a tautology: p → p is always true", () => {
    const table = buildTruthTable(["p → p"])
    expect(table.rows.map(r => r[1])).toEqual([true, true])
  })

  it("recognizes a contradiction: p ∧ ¬p is always false", () => {
    const table = buildTruthTable(["p ∧ ¬p"])
    expect(table.rows.map(r => r[1])).toEqual([false, false])
  })

  it("propagates parser errors for malformed expressions", () => {
    expect(() => buildTruthTable(["p ∧"])).toThrow()
  })
})

// ── renderTruthTableHTML ─────────────────────────────────────────────────────

describe("renderTruthTableHTML", () => {
  it("renders header cells for vars and expressions, and one row per assignment", () => {
    const html = renderTruthTableHTML("", "p ∧ q", "1")
    expect(html).toContain('<th>p</th>')
    expect(html).toContain('<th>q</th>')
    expect(html).toContain('class="tt-expr tt-last"')
    expect(html).toContain(">p ∧ q<")
    // 4 rows for 2 vars
    const rowMatches = html.match(/<tr>/g) ?? []
    // 1 header <tr> + 4 body <tr>
    expect(rowMatches).toHaveLength(5)
  })

  it("includes the title in the caption when provided", () => {
    const html = renderTruthTableHTML("My Table", "p ∨ q", "2")
    expect(html).toContain("Truth Table 2: My Table")
  })

  it("omits the title suffix when no title is given", () => {
    const html = renderTruthTableHTML("", "p ∨ q", "2")
    expect(html).toContain(">Truth Table 2<")
  })

  it("marks the last (result) column with tt-true/tt-false classes", () => {
    const html = renderTruthTableHTML("", "p ∧ q", "1")
    expect(html).toContain("tt-true")
    expect(html).toContain("tt-false")
  })

  it("escapes HTML in title and expressions", () => {
    const html = renderTruthTableHTML("<b>x</b>", "p", "1")
    expect(html).not.toContain("<b>x</b>")
    expect(html).toContain("&lt;b&gt;")
  })

  it("degrades gracefully (no throw) on empty content", () => {
    const html = renderTruthTableHTML("", "", "1")
    expect(html).toContain('class="tt-error"')
    expect(html).toContain("no expressions provided")
  })

  it("degrades gracefully (no throw) on malformed expressions", () => {
    const html = renderTruthTableHTML("", "p &&", "1")
    expect(html).toContain('class="tt-error"')
  })

  it("degrades gracefully (no throw) on unbalanced parentheses", () => {
    const html = renderTruthTableHTML("", "(p ∧ q", "1")
    expect(html).toContain('class="tt-error"')
  })

  it("rejects more than 5 variables", () => {
    const html = renderTruthTableHTML("", "a ∧ b ∧ c ∧ d ∧ e ∧ f", "1")
    expect(html).toContain("Too many variables")
  })

  it("supports multiple expression lines (multi-column truth table)", () => {
    const html = renderTruthTableHTML("", "p ∧ q\np ∨ q", "1")
    const headerCells = html.match(/<th(?:\s[^>]*)?>/g) ?? []
    // 2 vars + 2 exprs = 4 header cells
    expect(headerCells).toHaveLength(4)
  })
})
