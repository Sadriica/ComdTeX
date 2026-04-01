/**
 * Preprocessor: converts custom shorthand syntax to valid LaTeX.
 *
 * Behavior:
 *  - Inside $...$ or $$...$$  → shorthands are converted to LaTeX without wrapping
 *  - Outside math             → shorthands are auto-wrapped in $...$
 *  - [[r1],[r2]]              → always auto-wrap (matrix)
 *
 * Available shorthands:
 *  frac(a, b)   → \frac{a}{b}
 *  sqrt(x)      → \sqrt{x}
 *  root(n, x)   → \sqrt[n]{x}
 *  sum(i=0, n)  → \sum_{i=0}^{n}
 *  int(a, b)    → \int_{a}^{b}
 *  lim(x, a)    → \lim_{x \to a}
 *  vec(x)       → \vec{x}
 *  abs(x)       → \left|x\right|
 *  norm(x)      → \left\|x\right\|
 *  ceil(x)      → \left\lceil x \right\rceil
 *  floor(x)     → \left\lfloor x \right\rfloor
 *  sup(x, n)    → x^{n}
 *  sub(x, n)    → x_{n}
 *  hat(x)       → \hat{x}
 *  bar(x)       → \overline{x}
 *  tilde(x)     → \tilde{x}
 *  dot(x)       → \dot{x}
 *  ddot(x)      → \ddot{x}
 *  bf(x)        → \mathbf{x}
 *  cal(A)       → \mathcal{A}
 *  bb(R)        → \mathbb{R}
 *  pder(f, x)   → \frac{\partial f}{\partial x}
 *  der(f, x)    → \frac{df}{dx}
 *  inv(A)       → A^{-1}
 *  trans(A)     → A^{\top}
 *
 * Supports nesting: frac(sqrt(x), abs(y-1))
 */

// ── Balanced parenthesis parser ──────────────────────────────────────────────

function extractBalanced(text: string, start: number): { content: string; end: number } | null {
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === "(") depth++
    else if (text[i] === ")") {
      depth--
      if (depth === 0) return { content: text.slice(start + 1, i), end: i + 1 }
    }
  }
  return null
}

function splitArgs(s: string): string[] {
  const args: string[] = []
  let depth = 0
  let current = ""
  for (const ch of s) {
    if (ch === "(" || ch === "[") depth++
    else if (ch === ")" || ch === "]") depth--
    else if (ch === "," && depth === 0) {
      args.push(current.trim())
      current = ""
      continue
    }
    current += ch
  }
  if (current.trim()) args.push(current.trim())
  return args
}

// ── Shorthand handlers ───────────────────────────────────────────────────────

type Handler = (args: string[]) => string

export const HANDLERS: Record<string, Handler> = {
  mat: (args) => {
    const n = args.length
    if (n === 0) return "\\text{mat: sin valores}"
    // Auto-detect dimensions: factor closest to sqrt(n)
    let r = 1, c = n
    for (let i = Math.floor(Math.sqrt(n)); i >= 1; i--) {
      if (n % i === 0) { r = i; c = n / i; break }
    }
    const rowStrs = Array.from({ length: r }, (_, i) =>
      Array.from({ length: c }, (_, j) => args[i * c + j] ?? `a_{${i + 1}${j + 1}}`).join(" & ")
    )
    return `\\begin{bmatrix}${rowStrs.join(" \\\\ ")}\\end{bmatrix}`
  },
  matf: (args) => {
    const r = parseInt(args[0])
    const c = parseInt(args[1])
    if (isNaN(r) || isNaN(c) || r < 1 || c < 1) return "\\text{matf: dimensiones inválidas}"
    const values = args.slice(2)
    const rowStrs = Array.from({ length: r }, (_, i) =>
      Array.from({ length: c }, (_, j) => values[i * c + j] ?? `a_{${i + 1}${j + 1}}`).join(" & ")
    )
    return `\\begin{bmatrix}${rowStrs.join(" \\\\ ")}\\end{bmatrix}`
  },
  frac:  ([a, b])     => `\\frac{${a}}{${b ?? "?"}}`,
  sqrt:  ([x])        => `\\sqrt{${x}}`,
  root:  ([n, x])     => `\\sqrt[${n}]{${x ?? "?"}}`,
  sum:   ([from, to]) => `\\sum_{${from}}^{${to ?? "n"}}`,
  int:   ([a, b])     => `\\int_{${a}}^{${b ?? "b"}}`,
  lim:   ([x, a])     => `\\lim_{${x ?? "x"} \\to ${a ?? "\\infty"}}`,
  vec:   ([x])        => `\\vec{${x}}`,
  abs:   ([x])        => `\\left|${x}\\right|`,
  norm:  ([x])        => `\\left\\|${x}\\right\\|`,
  ceil:  ([x])        => `\\left\\lceil ${x} \\right\\rceil`,
  floor: ([x])        => `\\left\\lfloor ${x} \\right\\rfloor`,
  // Superscript / subscript
  sup:   ([x, n])     => `${x}^{${n ?? "n"}}`,
  sub:   ([x, n])     => `${x}_{${n ?? "n"}}`,
  // Decorators
  hat:   ([x])        => `\\hat{${x}}`,
  bar:   ([x])        => `\\overline{${x}}`,
  tilde: ([x])        => `\\tilde{${x}}`,
  dot:   ([x])        => `\\dot{${x}}`,
  ddot:  ([x])        => `\\ddot{${x}}`,
  // Math fonts
  bf:    ([x])        => `\\mathbf{${x}}`,
  cal:   ([x])        => `\\mathcal{${x}}`,
  bb:    ([x])        => `\\mathbb{${x}}`,
  // Derivatives
  pder:  ([f, x])     => `\\frac{\\partial ${f}}{\\partial ${x ?? "x"}}`,
  der:   ([f, x])     => `\\frac{d${f}}{d${x ?? "x"}}`,
  // Linear algebra
  inv:   ([x])        => `${x}^{-1}`,
  trans: ([x])        => `${x}^{\\top}`,
}

const NAMES = Object.keys(HANDLERS).join("|")
const SHORTHAND_RE = new RegExp(`\\b(${NAMES})\\s*\\(`, "g")

/** Expande shorthands en `text`. Si `wrap=true`, los envuelve en $...$ */
function expandShorthandsInRegion(text: string, wrap: boolean): string {
  let result = ""
  let cursor = 0
  SHORTHAND_RE.lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = SHORTHAND_RE.exec(text)) !== null) {
    const name = match[1]
    const parenStart = match.index + match[0].length - 1 // position of '('

    const balanced = extractBalanced(text, parenStart)
    if (!balanced) {
      // Unclosed parenthesis: copy text up to here as-is and continue
      result += text.slice(cursor, match.index + match[0].length)
      cursor = match.index + match[0].length
      continue
    }

    // Recurse into arguments (no wrap — they are inside a math context)
    const args = splitArgs(balanced.content).map((a) => expandShorthandsInRegion(a, false))

    const latex = HANDLERS[name](args)
    const output = wrap ? `$${latex}$` : latex

    result += text.slice(cursor, match.index) + output
    cursor = balanced.end
    SHORTHAND_RE.lastIndex = cursor
  }

  result += text.slice(cursor)
  return result
}

// ── Table shorthand (genera Markdown, no LaTeX) ──────────────────────────────

// table(Col1, Col2, Col3) → markdown table with those headers and one empty row
const TABLE_NAME_RE = /\btable\(/g

function applyTableShorthand(text: string): string {
  let result = ""
  let cursor = 0
  TABLE_NAME_RE.lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = TABLE_NAME_RE.exec(text)) !== null) {
    const parenStart = match.index + match[0].length - 1
    const balanced = extractBalanced(text, parenStart)
    if (!balanced) {
      result += text.slice(cursor, match.index + match[0].length)
      cursor = match.index + match[0].length
      continue
    }

    const headers = splitArgs(balanced.content).filter(Boolean)
    if (headers.length === 0) headers.push("Col1", "Col2")
    const sep = headers.map(() => "---")
    const table = [
      `| ${headers.join(" | ")} |`,
      `| ${sep.join(" | ")} |`,
    ].join("\n")

    result += text.slice(cursor, match.index) + table
    cursor = balanced.end
    TABLE_NAME_RE.lastIndex = cursor
  }

  result += text.slice(cursor)
  return result
}

// ── Matrix shorthand ─────────────────────────────────────────────────────────

function matrixToLatex(input: string): string {
  const data = JSON.parse(input) as number[][]
  const rows = data.map((row) => row.join(" & ")).join(" \\\\ ")
  return `\\begin{bmatrix}${rows}\\end{bmatrix}`
}

const MATRIX_RE = /\[\[[\d\s,\[\].-]+\]\]/g

function applyMatrixShorthand(text: string): string {
  return text.replace(MATRIX_RE, (match) => {
    try { return `$${matrixToLatex(match)}$` }
    catch { return match }
  })
}

// ── Main entry point ─────────────────────────────────────────────────────────

export function preprocess(text: string): string {
  const parts: string[] = []
  let cursor = 0

  // Detect existing math regions ($...$ and $$...$$)
  const mathRe = /\$\$([\s\S]+?)\$\$|\$([^\$\n]+?)\$/g
  let m: RegExpExecArray | null

  while ((m = mathRe.exec(text)) !== null) {
    // Text region before the math block → shorthands are auto-wrapped
    const before = text.slice(cursor, m.index)
    parts.push(applyTableShorthand(applyMatrixShorthand(expandShorthandsInRegion(before, true))))

    // Dentro del bloque math → shorthands sin wrap
    if (m[1] !== undefined) {
      // Display block $$...$$
      parts.push(`$$${expandShorthandsInRegion(m[1], false)}$$`)
    } else {
      // Inline $...$
      parts.push(`$${expandShorthandsInRegion(m[2], false)}$`)
    }

    cursor = m.index + m[0].length
    mathRe.lastIndex = cursor
  }

  // Texto restante
  const tail = text.slice(cursor)
  parts.push(applyTableShorthand(applyMatrixShorthand(expandShorthandsInRegion(tail, true))))

  return parts.join("")
}
