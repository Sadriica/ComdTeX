/**
 * Function Plotter for ComdTeX.
 *
 * Parses :::plot blocks and renders static SVG plots.
 * Uses a recursive descent parser — NO eval() or new Function().
 */

// ── AST ───────────────────────────────────────────────────────────────────────

type Expr =
  | { t: "num"; v: number }
  | { t: "var" }                             // x
  | { t: "const"; v: number }               // e, pi
  | { t: "unary"; op: "-"; child: Expr }
  | { t: "binary"; op: "+" | "-" | "*" | "/" | "^"; left: Expr; right: Expr }
  | { t: "call"; name: string; arg: Expr }

// ── Tokenizer ─────────────────────────────────────────────────────────────────

type TokKind = "NUM" | "ID" | "OP" | "LPAREN" | "RPAREN" | "EOF"
interface Tok { kind: TokKind; value: string }

function tokenize(src: string): Tok[] {
  const tokens: Tok[] = []
  let i = 0
  const ops = new Set(["+", "-", "*", "/", "^"])
  while (i < src.length) {
    const ch = src[i]
    if (/\s/.test(ch)) { i++; continue }
    if (ch === "(") { tokens.push({ kind: "LPAREN", value: "(" }); i++; continue }
    if (ch === ")") { tokens.push({ kind: "RPAREN", value: ")" }); i++; continue }
    if (ch === "*" && src[i + 1] === "*") {
      tokens.push({ kind: "OP", value: "^" }); i += 2; continue
    }
    if (ops.has(ch)) { tokens.push({ kind: "OP", value: ch }); i++; continue }
    // π unicode
    if (ch === "π") { tokens.push({ kind: "ID", value: "pi" }); i++; continue }
    // number
    if (/[0-9.]/.test(ch)) {
      let num = ""
      while (i < src.length && /[0-9.]/.test(src[i])) num += src[i++]
      // scientific notation
      if (i < src.length && (src[i] === "e" || src[i] === "E")) {
        const saved = i
        num += src[i++]
        if (i < src.length && (src[i] === "+" || src[i] === "-")) num += src[i++]
        if (i < src.length && /[0-9]/.test(src[i])) {
          while (i < src.length && /[0-9]/.test(src[i])) num += src[i++]
        } else {
          i = saved // backtrack — 'e' was an identifier
          num = num.slice(0, -1)
        }
      }
      tokens.push({ kind: "NUM", value: num })
      continue
    }
    // identifier
    if (/[a-zA-Z_]/.test(ch)) {
      let id = ""
      while (i < src.length && /[a-zA-Z0-9_]/.test(src[i])) id += src[i++]
      tokens.push({ kind: "ID", value: id })
      continue
    }
    throw new Error(`Unexpected character: '${ch}'`)
  }
  tokens.push({ kind: "EOF", value: "" })
  return tokens
}

// ── Parser ────────────────────────────────────────────────────────────────────

class Parser {
  private tokens: Tok[]
  private pos = 0

  constructor(tokens: Tok[]) {
    this.tokens = tokens
  }

  private peek(): Tok { return this.tokens[this.pos] }
  private consume(): Tok { return this.tokens[this.pos++] }

  private expect(kind: TokKind): Tok {
    const tok = this.consume()
    if (tok.kind !== kind) throw new Error(`Expected ${kind}, got '${tok.value}'`)
    return tok
  }

  // expr = addExpr
  parseExpr(): Expr {
    const result = this.parseAdd()
    if (this.peek().kind !== "EOF") {
      throw new Error(`Unexpected token: '${this.peek().value}'`)
    }
    return result
  }

  // addExpr = mulExpr (('+' | '-') mulExpr)*
  private parseAdd(): Expr {
    let left = this.parseMul()
    while (this.peek().kind === "OP" && (this.peek().value === "+" || this.peek().value === "-")) {
      const op = this.consume().value as "+" | "-"
      const right = this.parseMul()
      left = { t: "binary", op, left, right }
    }
    return left
  }

  // mulExpr = unaryExpr (('*' | '/') unaryExpr)*
  private parseMul(): Expr {
    let left = this.parseUnary()
    while (this.peek().kind === "OP" && (this.peek().value === "*" || this.peek().value === "/")) {
      const op = this.consume().value as "*" | "/"
      const right = this.parseUnary()
      left = { t: "binary", op, left, right }
    }
    return left
  }

  // unaryExpr = '-' unaryExpr | powExpr
  private parseUnary(): Expr {
    if (this.peek().kind === "OP" && this.peek().value === "-") {
      this.consume()
      const child = this.parseUnary()
      return { t: "unary", op: "-", child }
    }
    return this.parsePow()
  }

  // powExpr = atomExpr ('^' unaryExpr)?   — right-associative
  private parsePow(): Expr {
    const base = this.parseAtom()
    if (this.peek().kind === "OP" && this.peek().value === "^") {
      this.consume()
      const exp = this.parseUnary() // right-associative: parse another unary
      return { t: "binary", op: "^", left: base, right: exp }
    }
    return base
  }

  // atom = NUM | ID '(' expr ')' | ID | '(' expr ')'
  private parseAtom(): Expr {
    const tok = this.peek()

    if (tok.kind === "NUM") {
      this.consume()
      return { t: "num", v: parseFloat(tok.value) }
    }

    if (tok.kind === "LPAREN") {
      this.consume()
      const inner = this.parseAdd()
      this.expect("RPAREN")
      return inner
    }

    if (tok.kind === "ID") {
      this.consume()
      const name = tok.value

      // constants
      if (name === "pi") return { t: "const", v: Math.PI }
      if (name === "e")  return { t: "const", v: Math.E }

      // variable
      if (name === "x")  return { t: "var" }

      // function call: name(arg)
      if (this.peek().kind === "LPAREN") {
        this.consume()
        const arg = this.parseAdd()
        this.expect("RPAREN")
        return { t: "call", name, arg }
      }

      throw new Error(`Unknown identifier: '${name}'`)
    }

    throw new Error(`Unexpected token: '${tok.value}' (kind: ${tok.kind})`)
  }
}

// ── Evaluator ─────────────────────────────────────────────────────────────────

const FUNCTIONS: Record<string, (v: number) => number> = {
  sin:   Math.sin,
  cos:   Math.cos,
  tan:   Math.tan,
  asin:  Math.asin,
  acos:  Math.acos,
  atan:  Math.atan,
  sinh:  Math.sinh,
  cosh:  Math.cosh,
  tanh:  Math.tanh,
  exp:   Math.exp,
  log:   Math.log,
  log2:  Math.log2,
  log10: Math.log10,
  sqrt:  Math.sqrt,
  abs:   Math.abs,
  ceil:  Math.ceil,
  floor: Math.floor,
  round: Math.round,
  sign:  Math.sign,
}

function evalExpr(node: Expr, x: number): number {
  switch (node.t) {
    case "num":    return node.v
    case "const":  return node.v
    case "var":    return x
    case "unary":  return -evalExpr(node.child, x)
    case "binary": {
      const l = evalExpr(node.left, x)
      const r = evalExpr(node.right, x)
      switch (node.op) {
        case "+": return l + r
        case "-": return l - r
        case "*": return l * r
        case "/": return r === 0 ? NaN : l / r
        case "^": return Math.pow(l, r)
      }
    }
    case "call": {
      const fn = FUNCTIONS[node.name]
      if (!fn) throw new Error(`Unknown function: '${node.name}'`)
      return fn(evalExpr(node.arg, x))
    }
  }
}

/**
 * Parses and compiles a math expression string into an evaluatable function.
 * Throws on parse error.
 */
export function parseExpr(src: string): (x: number) => number {
  const tokens = tokenize(src.trim())
  const parser = new Parser(tokens)
  const ast = parser.parseExpr()
  return (x: number) => evalExpr(ast, x)
}

// ── Plot spec ─────────────────────────────────────────────────────────────────

export interface PlotFn {
  label: string
  fn: (x: number) => number
  expr: string
}

export interface PlotSpec {
  title: string
  fns: PlotFn[]
  xMin: number
  xMax: number
}

/**
 * Parses a :::plot block body into a PlotSpec.
 */
export function parsePlotBlock(title: string, content: string): PlotSpec {
  const DEFAULT_XMIN = -Math.PI * 2
  const DEFAULT_XMAX =  Math.PI * 2
  let xMin = DEFAULT_XMIN
  let xMax = DEFAULT_XMAX
  const fns: PlotFn[] = []

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    // range: [-2, 5]  or  x: [-2, 5]
    const rangeMatch = line.match(/^(?:range|x)\s*:\s*\[\s*(-?[\d.eE+]+)\s*,\s*(-?[\d.eE+]+)\s*\]/)
    if (rangeMatch) {
      xMin = parseFloat(rangeMatch[1])
      xMax = parseFloat(rangeMatch[2])
      continue
    }

    // Named: f(x) = expr  or  name(x) = expr
    const namedMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(\s*x\s*\)\s*=\s*(.+)$/)
    if (namedMatch) {
      const label = namedMatch[1]
      const expr  = namedMatch[2].trim()
      const fn = parseExpr(expr)
      fns.push({ label, fn, expr })
      continue
    }

    // Anonymous: just an expression
    const trimmed = line.trim()
    if (trimmed) {
      const fn = parseExpr(trimmed)
      const label = trimmed.length > 30 ? trimmed.slice(0, 27) + "…" : trimmed
      fns.push({ label, fn, expr: trimmed })
    }
  }

  return { title, fns, xMin, xMax }
}

// ── SVG rendering helpers ─────────────────────────────────────────────────────

function toSvgX(x: number, xMin: number, xMax: number, plotLeft: number, plotWidth: number): number {
  return plotLeft + ((x - xMin) / (xMax - xMin)) * plotWidth
}

function toSvgY(y: number, yMin: number, yMax: number, plotTop: number, plotHeight: number): number {
  return plotTop + plotHeight - ((y - yMin) / (yMax - yMin)) * plotHeight
}

function niceStep(range: number, targetSteps = 6): number {
  const rawStep = range / targetSteps
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const normalized = rawStep / mag
  let nice: number
  if (normalized < 1.5)      nice = 1
  else if (normalized < 3.5) nice = 2
  else if (normalized < 7.5) nice = 5
  else                       nice = 10
  return nice * mag
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

// ── Y-range auto-detection ────────────────────────────────────────────────────

function autoYRange(fns: PlotFn[], xMin: number, xMax: number): [number, number] {
  const SAMPLES = 200
  const values: number[] = []

  for (const { fn } of fns) {
    for (let i = 0; i <= SAMPLES; i++) {
      const x = xMin + (i / SAMPLES) * (xMax - xMin)
      const y = fn(x)
      if (isFinite(y) && !isNaN(y)) values.push(y)
    }
  }

  if (values.length === 0) return [-5, 5]

  values.sort((a, b) => a - b)
  const p5  = values[Math.floor(values.length * 0.05)]
  const p95 = values[Math.floor(values.length * 0.95)]
  const pad = (p95 - p5) * 0.10 || 1
  return [p5 - pad, p95 + pad]
}

// ── SVG renderer ──────────────────────────────────────────────────────────────

const COLORS = ["#7ca0d0", "#e8875a", "#6dbb8a", "#c37ece", "#e8c85a", "#e07070"]

/**
 * Renders a static SVG plot for one or more functions.
 */
export function renderPlotHTML(title: string, content: string): string {
  let spec: PlotSpec
  try {
    spec = parsePlotBlock(title, content)
  } catch (e) {
    return `<div class="plot-error">Plot error: ${escHtml(String(e))}</div>`
  }

  if (spec.fns.length === 0) {
    return `<div class="plot-error">Plot error: no functions defined</div>`
  }

  const fns = spec.fns.slice(0, 6)
  const { xMin, xMax } = spec

  // Layout constants
  const SVG_W = 500
  const SVG_H = 320
  const marginTop    = 20
  const marginRight  = 20
  const marginBottom = 40
  const marginLeft   = 50
  const plotLeft   = marginLeft
  const plotTop    = marginTop
  const plotWidth  = SVG_W - marginLeft - marginRight
  const plotHeight = SVG_H - marginTop - marginBottom

  // Y range
  const [yMin, yMax] = autoYRange(fns, xMin, xMax)
  const yRange = yMax - yMin || 1
  const xRange = xMax - xMin || 1

  // Grid lines
  const xStep = niceStep(xRange)
  const yStep = niceStep(yRange)

  const xStart = Math.ceil(xMin / xStep) * xStep
  const yStart = Math.ceil(yMin / yStep) * yStep

  const svgLines: string[] = []

  // Background
  svgLines.push(`<rect x="${plotLeft}" y="${plotTop}" width="${plotWidth}" height="${plotHeight}" fill="var(--surface2, #1a1a1a)" rx="2"/>`)

  // Clip rect for curves
  svgLines.push(`<clipPath id="plot-clip"><rect x="${plotLeft}" y="${plotTop}" width="${plotWidth}" height="${plotHeight}"/></clipPath>`)

  // Vertical grid lines + x labels
  for (let xv = xStart; xv <= xMax + xStep * 0.001; xv += xStep) {
    const sx = toSvgX(xv, xMin, xMax, plotLeft, plotWidth)
    if (sx < plotLeft - 0.5 || sx > plotLeft + plotWidth + 0.5) continue
    svgLines.push(`<line x1="${sx.toFixed(1)}" y1="${plotTop}" x2="${sx.toFixed(1)}" y2="${plotTop + plotHeight}" stroke="#333" stroke-width="0.5"/>`)
    // Tick label — format nicely
    const label = Math.abs(xv) < 1e-9 ? "0" : (Math.abs(xv) >= 1000 || Math.abs(xv) < 0.01) ? xv.toExponential(1) : parseFloat(xv.toPrecision(4)).toString()
    svgLines.push(`<text x="${sx.toFixed(1)}" y="${(plotTop + plotHeight + 14).toFixed(1)}" text-anchor="middle" font-size="9" fill="#888">${escHtml(label)}</text>`)
  }

  // Horizontal grid lines + y labels
  for (let yv = yStart; yv <= yMax + yStep * 0.001; yv += yStep) {
    const sy = toSvgY(yv, yMin, yMax, plotTop, plotHeight)
    if (sy < plotTop - 0.5 || sy > plotTop + plotHeight + 0.5) continue
    svgLines.push(`<line x1="${plotLeft}" y1="${sy.toFixed(1)}" x2="${plotLeft + plotWidth}" y2="${sy.toFixed(1)}" stroke="#333" stroke-width="0.5"/>`)
    const label = Math.abs(yv) < 1e-9 ? "0" : (Math.abs(yv) >= 1000 || Math.abs(yv) < 0.01) ? yv.toExponential(1) : parseFloat(yv.toPrecision(4)).toString()
    svgLines.push(`<text x="${(plotLeft - 5).toFixed(1)}" y="${(sy + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#888">${escHtml(label)}</text>`)
  }

  // Axes
  if (xMin <= 0 && 0 <= xMax) {
    const sx = toSvgX(0, xMin, xMax, plotLeft, plotWidth)
    svgLines.push(`<line x1="${sx.toFixed(1)}" y1="${plotTop}" x2="${sx.toFixed(1)}" y2="${plotTop + plotHeight}" stroke="#555" stroke-width="1"/>`)
  }
  if (yMin <= 0 && 0 <= yMax) {
    const sy = toSvgY(0, yMin, yMax, plotTop, plotHeight)
    svgLines.push(`<line x1="${plotLeft}" y1="${sy.toFixed(1)}" x2="${plotLeft + plotWidth}" y2="${sy.toFixed(1)}" stroke="#555" stroke-width="1"/>`)
  }

  // Function curves
  const NSAMPLES = 500

  for (let fi = 0; fi < fns.length; fi++) {
    const { fn } = fns[fi]
    const color = COLORS[fi % COLORS.length]

    // Collect runs of valid points, break on non-finite y
    let currentRun: string[] = []

    const flushRun = () => {
      if (currentRun.length >= 2) {
        svgLines.push(`<polyline points="${currentRun.join(" ")}" stroke="${color}" stroke-width="1.5" fill="none" clip-path="url(#plot-clip)"/>`)
      }
      currentRun = []
    }

    for (let i = 0; i <= NSAMPLES; i++) {
      const x = xMin + (i / NSAMPLES) * xRange
      let y: number
      try { y = fn(x) } catch { y = NaN }

      if (!isFinite(y) || isNaN(y) || Math.abs(y) > 1e6) {
        flushRun()
      } else {
        const sx = toSvgX(x, xMin, xMax, plotLeft, plotWidth)
        const sy = toSvgY(y, yMin, yMax, plotTop, plotHeight)
        currentRun.push(`${sx.toFixed(2)},${sy.toFixed(2)}`)
      }
    }
    flushRun()
  }

  // Legend (bottom-right inside plot area)
  const legendX = plotLeft + plotWidth - 8
  let legendY = plotTop + plotHeight - 8 - (fns.length - 1) * 16
  if (legendY < plotTop + 8) legendY = plotTop + 8

  for (let fi = 0; fi < fns.length; fi++) {
    const color = COLORS[fi % COLORS.length]
    const { label } = fns[fi]
    const ly = legendY + fi * 16
    const displayLabel = label.length > 22 ? label.slice(0, 20) + "…" : label
    svgLines.push(`<rect x="${(legendX - 18).toFixed(1)}" y="${(ly - 7).toFixed(1)}" width="10" height="3" fill="${color}" rx="1"/>`)
    svgLines.push(`<text x="${(legendX - 5).toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="end" font-size="9" fill="#ccc">${escHtml(displayLabel)}</text>`)
  }

  // Border around plot area
  svgLines.push(`<rect x="${plotLeft}" y="${plotTop}" width="${plotWidth}" height="${plotHeight}" fill="none" stroke="#444" stroke-width="0.5"/>`)

  const titleHtml = spec.title
    ? `<div class="plot-title">${escHtml(spec.title)}</div>`
    : ""

  const svgContent = `<svg viewBox="0 0 ${SVG_W} ${SVG_H}" width="100%" style="max-width:600px;cursor:crosshair" xmlns="http://www.w3.org/2000/svg">
${svgLines.join("\n")}
</svg>`

  return `<div class="plot-block">${titleHtml}${svgContent}</div>`
}
