interface VarNode { kind: "var"; name: string }
interface UnaryNode { kind: "not"; child: ASTNode }
interface BinaryNode { kind: "and" | "or" | "implies" | "iff"; left: ASTNode; right: ASTNode }
type ASTNode = VarNode | UnaryNode | BinaryNode

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

// ── Tokenizer ─────────────────────────────────────────────────────────────────

type TokenKind = "VAR" | "NOT" | "AND" | "OR" | "IMPLIES" | "IFF" | "LPAREN" | "RPAREN" | "EOF"
interface Token { kind: TokenKind; value: string }

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < input.length) {
    const ch = input[i]
    if (/\s/.test(ch)) { i++; continue }

    if (ch === "(") { tokens.push({ kind: "LPAREN", value: "(" }); i++; continue }
    if (ch === ")") { tokens.push({ kind: "RPAREN", value: ")" }); i++; continue }

    if (ch === "¬" || ch === "!") { tokens.push({ kind: "NOT", value: ch }); i++; continue }

    if (ch === "∧" || ch === "*") { tokens.push({ kind: "AND", value: ch }); i++; continue }
    if (ch === "&" && input[i + 1] === "&") { tokens.push({ kind: "AND", value: "&&" }); i += 2; continue }

    if (ch === "∨" || ch === "+") { tokens.push({ kind: "OR", value: ch }); i++; continue }
    if (ch === "|" && input[i + 1] === "|") { tokens.push({ kind: "OR", value: "||" }); i += 2; continue }

    if (ch === "→") { tokens.push({ kind: "IMPLIES", value: "→" }); i++; continue }
    if (ch === "-" && input[i + 1] === ">") { tokens.push({ kind: "IMPLIES", value: "->" }); i += 2; continue }

    if (ch === "↔" || ch === "≡") { tokens.push({ kind: "IFF", value: ch }); i++; continue }
    if (ch === "<" && input[i + 1] === "-" && input[i + 2] === ">") { tokens.push({ kind: "IFF", value: "<->" }); i += 3; continue }

    if (/[a-zA-Z]/.test(ch)) {
      let word = ""
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) { word += input[i]; i++ }
      const up = word.toUpperCase()
      if (up === "NOT") { tokens.push({ kind: "NOT", value: word }); continue }
      if (up === "AND") { tokens.push({ kind: "AND", value: word }); continue }
      if (up === "OR") { tokens.push({ kind: "OR", value: word }); continue }
      if (up === "IMPLIES") { tokens.push({ kind: "IMPLIES", value: word }); continue }
      if (up === "IFF") { tokens.push({ kind: "IFF", value: word }); continue }
      tokens.push({ kind: "VAR", value: word })
      continue
    }

    throw new Error(`Unexpected character: '${ch}'`)
  }
  tokens.push({ kind: "EOF", value: "" })
  return tokens
}

// ── Recursive descent parser ──────────────────────────────────────────────────
// Precedence: ¬ > ∧ > ∨ > → > ↔

class Parser {
  private tokens: Token[]
  private pos = 0

  constructor(tokens: Token[]) { this.tokens = tokens }

  private peek(): Token { return this.tokens[this.pos] }
  private consume(): Token { return this.tokens[this.pos++] }
  private expect(kind: TokenKind): Token {
    const t = this.peek()
    if (t.kind !== kind) throw new Error(`Expected ${kind} but got ${t.kind} ('${t.value}')`)
    return this.consume()
  }

  parseIff(): ASTNode {
    let left = this.parseImplies()
    while (this.peek().kind === "IFF") {
      this.consume()
      const right = this.parseImplies()
      left = { kind: "iff", left, right }
    }
    return left
  }

  parseImplies(): ASTNode {
    let left = this.parseOr()
    while (this.peek().kind === "IMPLIES") {
      this.consume()
      const right = this.parseOr()
      left = { kind: "implies", left, right }
    }
    return left
  }

  parseOr(): ASTNode {
    let left = this.parseAnd()
    while (this.peek().kind === "OR") {
      this.consume()
      const right = this.parseAnd()
      left = { kind: "or", left, right }
    }
    return left
  }

  parseAnd(): ASTNode {
    let left = this.parseNot()
    while (this.peek().kind === "AND") {
      this.consume()
      const right = this.parseNot()
      left = { kind: "and", left, right }
    }
    return left
  }

  parseNot(): ASTNode {
    if (this.peek().kind === "NOT") {
      this.consume()
      return { kind: "not", child: this.parseNot() }
    }
    return this.parseAtom()
  }

  parseAtom(): ASTNode {
    const t = this.peek()
    if (t.kind === "VAR") { this.consume(); return { kind: "var", name: t.value } }
    if (t.kind === "LPAREN") {
      this.consume()
      const inner = this.parseIff()
      this.expect("RPAREN")
      return inner
    }
    throw new Error(`Unexpected token: ${t.kind} ('${t.value}')`)
  }

  parse(): ASTNode {
    const node = this.parseIff()
    if (this.peek().kind !== "EOF") throw new Error(`Unexpected token after expression: '${this.peek().value}'`)
    return node
  }
}

export function parseBoolExpr(expr: string): ASTNode {
  const tokens = tokenize(expr)
  return new Parser(tokens).parse()
}

// ── Evaluation ────────────────────────────────────────────────────────────────

export function evalExpr(ast: ASTNode, assignment: Record<string, boolean>): boolean {
  switch (ast.kind) {
    case "var": {
      if (!(ast.name in assignment)) throw new Error(`Unassigned variable: ${ast.name}`)
      return assignment[ast.name]
    }
    case "not": return !evalExpr(ast.child, assignment)
    case "and": return evalExpr(ast.left, assignment) && evalExpr(ast.right, assignment)
    case "or": return evalExpr(ast.left, assignment) || evalExpr(ast.right, assignment)
    case "implies": return !evalExpr(ast.left, assignment) || evalExpr(ast.right, assignment)
    case "iff": return evalExpr(ast.left, assignment) === evalExpr(ast.right, assignment)
  }
}

// ── Variable extraction (in order of first appearance) ───────────────────────

export function extractVars(ast: ASTNode): string[] {
  const seen = new Set<string>()
  const order: string[] = []
  function visit(node: ASTNode) {
    switch (node.kind) {
      case "var":
        if (!seen.has(node.name)) { seen.add(node.name); order.push(node.name) }
        break
      case "not": visit(node.child); break
      case "and": case "or": case "implies": case "iff":
        visit(node.left); visit(node.right); break
    }
  }
  visit(ast)
  return order
}

// ── Truth table builder ───────────────────────────────────────────────────────

export function buildTruthTable(exprs: string[]): { vars: string[]; exprs: string[]; rows: boolean[][] } {
  const asts = exprs.map(e => parseBoolExpr(e))
  const seenVars = new Set<string>()
  const vars: string[] = []
  for (const ast of asts) {
    for (const v of extractVars(ast)) {
      if (!seenVars.has(v)) { seenVars.add(v); vars.push(v) }
    }
  }
  const n = vars.length
  const rowCount = 1 << n
  const rows: boolean[][] = []
  for (let mask = 0; mask < rowCount; mask++) {
    const assignment: Record<string, boolean> = {}
    for (let vi = 0; vi < n; vi++) {
      assignment[vars[vi]] = ((mask >> (n - 1 - vi)) & 1) === 0
    }
    const row: boolean[] = vars.map(v => assignment[v])
    for (const ast of asts) {
      row.push(evalExpr(ast, assignment))
    }
    rows.push(row)
  }
  return { vars, exprs, rows }
}

// ── HTML renderer ─────────────────────────────────────────────────────────────

export function renderTruthTableHTML(title: string, content: string): string {
  try {
    const exprLines = content.split("\n").map(l => l.trim()).filter(l => l.length > 0)
    if (exprLines.length === 0) return `<div class="tt-error">Truth table error: no expressions provided</div>`

    let table: ReturnType<typeof buildTruthTable>
    try {
      table = buildTruthTable(exprLines)
    } catch (e) {
      return `<div class="tt-error">Truth table error: ${escHtml(String(e).replace(/^Error:\s*/, ""))}</div>`
    }

    if (table.vars.length > 5) {
      return `<div class="tt-error">Too many variables (max 5)</div>`
    }

    const nVars = table.vars.length
    const nExprs = table.exprs.length

    const headerCells: string[] = [
      ...table.vars.map(v => `<th>${escHtml(v)}</th>`),
      ...table.exprs.map((e, i) => {
        const isLast = i === nExprs - 1
        const cls = isLast ? "tt-expr tt-last" : "tt-expr"
        return `<th class="${cls}">${escHtml(e)}</th>`
      }),
    ]

    const bodyRows = table.rows.map(row => {
      const cells: string[] = []
      for (let i = 0; i < nVars; i++) {
        cells.push(`<td>${row[i] ? "T" : "F"}</td>`)
      }
      for (let i = 0; i < nExprs; i++) {
        const val = row[nVars + i]
        const isLast = i === nExprs - 1
        if (isLast) {
          const cls = `tt-result ${val ? "tt-true" : "tt-false"}`
          cells.push(`<td class="${cls}">${val ? "T" : "F"}</td>`)
        } else {
          cells.push(`<td>${val ? "T" : "F"}</td>`)
        }
      }
      return `<tr>${cells.join("")}</tr>`
    })

    const titleHTML = title ? `<div class="tt-title">${escHtml(title)}</div>` : ""

    return [
      `<div class="truth-table-block">`,
      titleHTML,
      `<table class="tt-table">`,
      `<thead><tr>${headerCells.join("")}</tr></thead>`,
      `<tbody>${bodyRows.join("")}</tbody>`,
      `</table>`,
      `</div>`,
    ].filter(Boolean).join("\n")
  } catch (e) {
    return `<div class="tt-error">Truth table error: ${escHtml(String(e).replace(/^Error:\s*/, ""))}</div>`
  }
}
