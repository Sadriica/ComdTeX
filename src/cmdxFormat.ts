/**
 * CMDX Format Converter - Bidirectional conversion between storage and internal formats.
 *
 * CMDX (ComdTeX Internal Format) is the working format that exists only in memory
 * while the user edits. Files on disk (.md or .tex) are converted to CMDX when opened
 * and converted back when saved.
 *
 * Flow:
 *   .md/.tex on disk → toCmdx() → CMDX in memory → User edits
 *   User saves → toStorage() → .md/.tex on disk
 *
 * This module is only the storage gateway. User-facing exports and Pandoc
 * temporary inputs live in exportConversion.ts, even when they reuse one of
 * these low-level format transforms.
 */

export type StorageFormat = "md" | "tex"

export type ConversionWarningCode =
  | "unclosed-cmdx-environment"
  | "unsupported-latex-environment"
  | "latex-preamble-preserved"
  | "custom-latex-macro-preserved"
  | "unbalanced-shorthand"
  | "size-prefix-dropped"

export interface ConversionWarning {
  code: ConversionWarningCode
  message: string
  line: number
  excerpt: string
}

export interface ConversionReport {
  warnings: ConversionWarning[]
}

export type CmdxNode =
  | { type: "text"; content: string }
  | { type: "environment"; name: string; title?: string; label?: string; children: CmdxNode[] }

export function storageFormatForPath(path: string): StorageFormat | null {
  const lower = path.toLowerCase()
  if (lower.endsWith(".tex")) return "tex"
  if (lower.endsWith(".md")) return "md"
  return null
}

export function toEditorContent(path: string, content: string): string {
  const format = storageFormatForPath(path)
  return format ? toCmdx(content, format) : content
}

export function toDiskContent(path: string, content: string): string {
  const format = storageFormatForPath(path)
  return format ? toStorage(content, format) : content
}

export function analyzeConversion(text: string, format: StorageFormat): ConversionReport {
  const warnings: ConversionWarning[] = []
  warnings.push(...findUnclosedCmdxEnvironments(text))
  warnings.push(...findUnbalancedShorthands(text))
  if (format === "md") {
    warnings.push(...findSizePrefixedEnvironments(text))
  }
  if (format === "tex") {
    warnings.push(...findUnsupportedLatex(text))
  }
  return { warnings }
}

function findSizePrefixedEnvironments(text: string): ConversionWarning[] {
  const warnings: ConversionWarning[] = []
  const re = /^:::(sm|lg)\s+[\w]+/gm
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    warnings.push({
      code: "size-prefix-dropped",
      message: `Size prefix '${match[1]}' is not representable in Obsidian callouts and will be lost when saved as .md.`,
      line: lineForIndex(text, match.index),
      excerpt: excerptAt(text, match.index),
    })
  }
  return warnings
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

function extractBalanced(text: string, start: number): { content: string; end: number } | null {
  let depth = 0
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (ch === "(") depth++
    else if (ch === ")") {
      depth--
      if (depth === 0) return { content: text.slice(start + 1, i), end: i + 1 }
    }
  }
  return null
}

/**
 * Detects if content is already in CMDX format (contains :::env or shorthand syntax).
 */
export function isCmdxFormat(text: string): boolean {
  return /^:::\s*(?:(?:sm|lg)\s+)?[\w]+/m.test(text) || /\b(table|mat|pmat|bmat|matf|frac|sqrt|root|sum|int|lim|vec|abs|norm|bf|cal|bb|sup|sub|pder|der)\s*\(/.test(text)
}

/**
 * Detects storage format based on content or extension.
 */
export function detectStorageFormat(path: string, _content?: string): StorageFormat {
  return storageFormatForPath(path) ?? "md"
}

function withFrontmatter(text: string, convertBody: (body: string) => string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(text)
  if (!match) return convertBody(text)
  return match[0] + convertBody(text.slice(match[0].length))
}

// ── CMDX → Storage ────────────────────────────────────────────────────────────────

/**
 * Convert CMDX to storage format (.md or .tex).
 */
export function toStorage(text: string, format: StorageFormat): string {
  if (format === "tex") return toStorageTex(text)
  return toStorageMd(text)
}

/**
 * Convert CMDX to Markdown (.md) - Obsidian compatible.
 */
export function toStorageMd(text: string): string {
  return withFrontmatter(text, (body) =>
    convertCmdxEnvironments(convertFunctions(body, MARKDOWN_FUNCTIONS), "md")
  )
}

/**
 * Convert CMDX to LaTeX (.tex).
 */
export function toStorageTex(text: string): string {
  return withFrontmatter(text, (body) =>
    convertTexLabelsAndRefs(convertCmdxEnvironments(convertFunctions(body, LATEX_FUNCTIONS), "tex"))
    )
}

type FunctionHandler = (args: string[]) => string

function convertFunctions(text: string, handlers: Record<string, FunctionHandler>): string {
  const names = Object.keys(handlers).join("|")
  const re = new RegExp(`\\b(${names})\\s*\\(`, "g")
  let result = ""
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = re.exec(text)) !== null) {
    const name = match[1]
    const parenStart = match.index + match[0].length - 1
    const balanced = extractBalanced(text, parenStart)
    if (!balanced) continue

    const args = splitArgs(balanced.content).map((arg) => convertFunctions(arg, handlers))
    result += text.slice(cursor, match.index) + handlers[name](args)
    cursor = balanced.end
    re.lastIndex = cursor
  }

  return result + text.slice(cursor)
}

function lineForIndex(text: string, index: number): number {
  let line = 1
  for (let i = 0; i < index; i++) if (text[i] === "\n") line++
  return line
}

function excerptAt(text: string, index: number): string {
  const start = text.lastIndexOf("\n", index - 1) + 1
  const next = text.indexOf("\n", index)
  const end = next >= 0 ? next : text.length
  return text.slice(start, end).trim()
}

function findUnbalancedShorthands(text: string): ConversionWarning[] {
  const warnings: ConversionWarning[] = []
  const re = /\b(table|mat|pmat|bmat|matf|frac|sqrt|root|sum|int|lim|vec|abs|norm|bf|cal|bb|sup|sub|pder|der)\s*\(/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    const parenStart = match.index + match[0].length - 1
    if (extractBalanced(text, parenStart)) continue
    warnings.push({
      code: "unbalanced-shorthand",
      message: `Unbalanced CMDX shorthand '${match[1]}(...)' was preserved as text.`,
      line: lineForIndex(text, match.index),
      excerpt: excerptAt(text, match.index),
    })
  }
  return warnings
}

function matrixToLatex(name: string, values: string[]): string {
  const n = values.length
  let r = 1, c = n
  for (let i = Math.floor(Math.sqrt(n)); i >= 1; i--) {
    if (n % i === 0) { r = i; c = n / i; break }
  }
  const rows = Array.from({ length: r }, (_, i) =>
    Array.from({ length: c }, (_, j) => values[i * c + j] ?? "0").join(" & ")
  ).join(" \\\\ ")
  // mat() and bmat() both target \begin{bmatrix} — consistent with preprocessor.ts
  // where mat() also expands to bmatrix. pmat() targets \begin{pmatrix}.
  const env = name === "pmat" ? "pmatrix" : "bmatrix"
  return `\\begin{${env}}${rows}\\end{${env}}`
}

const MARKDOWN_FUNCTIONS: Record<string, FunctionHandler> = {
  table: (cols) => {
    const headers = cols.filter(Boolean)
    if (headers.length < 2) return headers[0] ? `| ${headers[0]} |` : "table()"
    return [
      `| ${headers.join(" | ")} |`,
      `| ${headers.map(() => "---").join(" | ")} |`,
    ].join("\n")
  },
}

const LATEX_FUNCTIONS: Record<string, FunctionHandler> = {
  mat: (args) => matrixToLatex("mat", args),
  pmat: (args) => matrixToLatex("pmat", args),
  bmat: (args) => matrixToLatex("bmat", args),
  frac: ([a, b]) => `\\frac{${a}}{${b ?? "?"}}`,
  sqrt: ([x]) => `\\sqrt{${x}}`,
  root: ([n, x]) => `\\sqrt[${n}]{${x ?? "?"}}`,
  sum: ([from, to]) => `\\sum_{${from}}^{${to ?? "n"}}`,
  int: ([a, b]) => `\\int_{${a}}^{${b ?? "b"}}`,
  lim: ([x, a]) => `\\lim_{${x ?? "x"} \\to ${a ?? "\\infty"}}`,
  vec: ([x]) => `\\vec{${x}}`,
  abs: ([x]) => `\\left|${x}\\right|`,
  norm: ([x]) => `\\left\\|${x}\\right\\|`,
  bf: ([x]) => `\\mathbf{${x}}`,
  cal: ([x]) => `\\mathcal{${x}}`,
  bb: ([x]) => `\\mathbb{${x}}`,
  sup: ([x, n]) => `${x}^{${n ?? "n"}}`,
  sub: ([x, n]) => `${x}_{${n ?? "n"}}`,
  pder: ([f, x]) => `\\frac{\\partial ${f}}{\\partial ${x ?? "x"}}`,
  der: ([f, x]) => `\\frac{d${f}}{d${x ?? "x"}}`,
}

interface CmdxEnvStart {
  rawName: string
  title?: string
  label?: string
}

const CMDX_ENV_START_RE = /^:::(?:(?:sm|lg)\s+)?([\w]+)(?:\[([^\]]*)\])?(?:\s*\{#([\w:.-]+)\})?\s*$/
const CMDX_ENV_END_RE = /^:::\s*$/

function parseCmdxEnvStart(line: string): CmdxEnvStart | null {
  const match = CMDX_ENV_START_RE.exec(line)
  if (!match || CMDX_ENV_END_RE.test(line)) return null
  return { rawName: match[1], title: match[2], label: match[3] }
}

function convertCmdxEnvironments(text: string, format: StorageFormat): string {
  const lines = text.split("\n")

  const convertRange = (start: number, end: number): string[] => {
    const out: string[] = []
    for (let i = start; i < end; i++) {
      const parsed = parseCmdxEnvStart(lines[i])
      if (!parsed) {
        out.push(lines[i])
        continue
      }

      let depth = 1
      let close = -1
      for (let j = i + 1; j < end; j++) {
        if (parseCmdxEnvStart(lines[j])) depth++
        else if (CMDX_ENV_END_RE.test(lines[j])) depth--
        if (depth === 0) {
          close = j
          break
        }
      }
      if (close < 0) {
        out.push(lines[i])
        continue
      }

      const body = convertRange(i + 1, close).join("\n").trim()
      out.push(format === "tex"
        ? cmdxEnvironmentToTex(parsed, body)
        : cmdxEnvironmentToMarkdown(parsed, body)
      )
      i = close
    }
    return out
  }

  return convertRange(0, lines.length).join("\n")
}

export function parseCmdxDocument(text: string): CmdxNode[] {
  const lines = text.split("\n")

  const parseRange = (start: number, end: number): { nodes: CmdxNode[]; next: number } => {
    const nodes: CmdxNode[] = []
    let textBuffer: string[] = []

    const flushText = () => {
      if (textBuffer.length === 0) return
      nodes.push({ type: "text", content: textBuffer.join("\n") })
      textBuffer = []
    }

    let i = start
    while (i < end) {
      const parsed = parseCmdxEnvStart(lines[i])
      if (!parsed) {
        if (CMDX_ENV_END_RE.test(lines[i])) break
        textBuffer.push(lines[i])
        i++
        continue
      }

      flushText()
      const child = parseRange(i + 1, end)
      nodes.push({
        type: "environment",
        name: parsed.rawName.toLowerCase(),
        title: parsed.title,
        label: parsed.label,
        children: child.nodes,
      })
      i = child.next
      if (i < end && CMDX_ENV_END_RE.test(lines[i])) i++
    }

    flushText()
    return { nodes, next: i }
  }

  return parseRange(0, lines.length).nodes
}

function findUnclosedCmdxEnvironments(text: string): ConversionWarning[] {
  const lines = text.split("\n")
  const stack: Array<{ line: number; excerpt: string }> = []
  lines.forEach((line, index) => {
    if (parseCmdxEnvStart(line)) stack.push({ line: index + 1, excerpt: line.trim() })
    else if (CMDX_ENV_END_RE.test(line) && stack.length > 0) stack.pop()
  })
  return stack.map((item) => ({
    code: "unclosed-cmdx-environment",
    message: "Unclosed CMDX environment was preserved as text.",
    line: item.line,
    excerpt: item.excerpt,
  }))
}

const SUPPORTED_LATEX_ENVS = new Set([
  "theorem", "lemma", "corollary", "proposition", "definition", "example",
  "exercise", "proof", "remark", "note", "equation", "align", "gather",
  "multline", "bmatrix", "matrix", "pmatrix", "vmatrix",
])

function findUnsupportedLatex(text: string): ConversionWarning[] {
  const warnings: ConversionWarning[] = []
  const envRe = /\\begin\{(\w+)\}/g
  let envMatch: RegExpExecArray | null
  while ((envMatch = envRe.exec(text)) !== null) {
    if (SUPPORTED_LATEX_ENVS.has(envMatch[1])) continue
    warnings.push({
      code: "unsupported-latex-environment",
      message: `LaTeX environment '${envMatch[1]}' is preserved because CMDX has no semantic mapping for it.`,
      line: lineForIndex(text, envMatch.index),
      excerpt: excerptAt(text, envMatch.index),
    })
  }

  const macroRe = /^\\(?:newcommand|renewcommand|def)\b.*$/gm
  let macroMatch: RegExpExecArray | null
  while ((macroMatch = macroRe.exec(text)) !== null) {
    warnings.push({
      code: "custom-latex-macro-preserved",
      message: "Custom LaTeX macro definition is preserved and not interpreted as CMDX.",
      line: lineForIndex(text, macroMatch.index),
      excerpt: macroMatch[0].trim(),
    })
  }

  const preambleRe = /^\\(?:documentclass|usepackage)\b.*$/gm
  let preambleMatch: RegExpExecArray | null
  while ((preambleMatch = preambleRe.exec(text)) !== null) {
    warnings.push({
      code: "latex-preamble-preserved",
      message: "LaTeX preamble command is preserved and not interpreted as CMDX.",
      line: lineForIndex(text, preambleMatch.index),
      excerpt: preambleMatch[0].trim(),
    })
  }

  return warnings
}

function cmdxEnvironmentToMarkdown(envStart: CmdxEnvStart, body: string): string {
  const name = envStart.rawName.toLowerCase()
  const callout = OBSIDIAN_CALLOUTS[name] ?? "note"
  const defaultTitle = ENV_TITLES[name] ?? name.charAt(0).toUpperCase() + name.slice(1)
  const heading = envStart.title?.trim() ? ` ${defaultTitle}: ${envStart.title.trim()}` : ` ${defaultTitle}`
  const lines = body ? body.split("\n").map((line) => `> ${line}`) : []
  return [`> [!${callout}]${heading}`, ...lines].join("\n")
}

function cmdxEnvironmentToTex(envStart: CmdxEnvStart, body: string): string {
  const name = envStart.rawName.toLowerCase()
  const env = LATEX_ENVS[name] ?? name
  const optTitle = envStart.title?.trim() ? `[${envStart.title.trim()}]` : ""
  const labelLine = envStart.label ? `\n\\label{${envStart.label}}` : ""
  return `\\begin{${env}}${optTitle}${labelLine}\n${body}\n\\end{${env}}`
}

function convertTexLabelsAndRefs(text: string): string {
  return text
    .replace(/\{#eq:([\w:.-]+)\}/g, "\\label{eq:$1}")
    .replace(/\{#(fig:[\w:.-]+)\}/g, "\\label{$1}")
    .replace(/\{#(sec:[\w:.-]+)\}/g, "\\label{$1}")
    .replace(/\{#(tbl:[\w:.-]+)\}/g, "\\label{$1}")
    .replace(/@eq:([\w:.-]+)/g, "\\eqref{eq:$1}")
    .replace(/@fig:([\w:.-]+)/g, "Figura~\\ref{fig:$1}")
    .replace(/@sec:([\w:.-]+)/g, "sección~\\ref{sec:$1}")
    .replace(/@tbl:([\w:.-]+)/g, "Tabla~\\ref{tbl:$1}")
}

// ── Storage → CMDX ────────────────────────────────────────────────────────────────

/**
 * Convert storage format to CMDX.
 */
export function toCmdx(text: string, format: StorageFormat): string {
  if (format === "tex") return toCmdxTex(text)
  return toCmdxMd(text)
}

/**
 * Convert Markdown (.md) to CMDX - handles Obsidian callouts.
 */
export function toCmdxMd(text: string): string {
  return withFrontmatter(text, (body) => convertMarkdownTables(convertMarkdownCallouts(body)))
}

function isMarkdownTableLine(line: string): boolean {
  return /^\s*\|.*\|\s*$/.test(line)
}

function isMarkdownSeparatorLine(line: string): boolean {
  const cells = line.trim().slice(1, -1).split("|").map((cell) => cell.trim())
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function markdownTableHeaders(line: string): string[] {
  return line.trim().slice(1, -1).split("|").map((cell) => cell.trim()).filter(Boolean)
}

function convertMarkdownTables(text: string): string {
  const lines = text.split("\n")
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    if (i + 1 < lines.length && isMarkdownTableLine(lines[i]) && isMarkdownSeparatorLine(lines[i + 1])) {
      out.push(`table(${markdownTableHeaders(lines[i]).join(", ")})`)
      i += 1
      while (i + 1 < lines.length && isMarkdownTableLine(lines[i + 1])) i++
      continue
    }
    out.push(lines[i])
  }
  return out.join("\n")
}

function convertMarkdownCallouts(text: string): string {
  const lines = text.split(/\r?\n/)
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const start = /^>\s*\[!([\w-]+)\][+-]?\s*(.*)$/.exec(lines[i])
    if (!start) {
      out.push(lines[i])
      continue
    }

    const { env, title } = obsidianCalloutToCmdx(start[1], start[2].trim())
    const bodyLines: string[] = []
    while (i + 1 < lines.length) {
      const continuation = /^>\s?(.*)$/.exec(lines[i + 1])
      if (!continuation || /^>\s*\[!([\w-]+)\]/.test(lines[i + 1])) break
      bodyLines.push(continuation[1])
      i++
    }

    out.push(`:::${env}${title ? `[${title}]` : ""}`)
    out.push(...bodyLines)
    out.push(":::")
  }
  return out.join("\n")
}

function obsidianCalloutToCmdx(type: string, rawTitle: string): { env: string; title: string } {
  const normalizedType = type.toLowerCase()
  for (const [title, env] of Object.entries(OBSIDIAN_TITLE_TO_CMDX)) {
    if (rawTitle === title) return { env, title: "" }
    if (rawTitle.startsWith(`${title}:`)) return { env, title: rawTitle.slice(title.length + 1).trim() }
  }
  return { env: OBSIDIAN_TO_CMDX[normalizedType] ?? "note", title: rawTitle }
}

/**
 * Convert LaTeX (.tex) to CMDX.
 */
export function toCmdxTex(text: string): string {
  return withFrontmatter(text, (body) => body
    // Matrices → mat() shorthand
    .replace(/\\begin\{(bmatrix|matrix|pmatrix|vmatrix)\}([\s\S]*?)\\end\{\1\}/g, (_full, env, content) => {
      const values = content.trim().split(/&|\\\\/).map((v: string) => v.trim()).filter(Boolean)
      const name = env === "bmatrix" ? "mat" : env === "pmatrix" ? "pmat" : "mat"
      return `${name}(${values.join(", ")})`
    })
    // LaTeX environments → CMDX environments
    .replace(/\\begin\{(\w+)\}(\[[^\]]*])?([\s\S]*?)\\end\{\1\}/g, (_full, rawName, optTitle, envBody) => {
      const name = rawName.toLowerCase()
      const labelMatch = /\\label\{([\w:.-]+)\}/.exec(envBody)
      const bodyWithoutLabel = envBody.replace(/\s*\\label\{[\w:.-]+}\s*/, "\n").trim()
      if (["equation", "align", "gather", "multline"].includes(name)) {
        return `\\begin{${name}}\n${bodyWithoutLabel}\n${labelMatch ? `\\label{${labelMatch[1]}}\n` : ""}\\end{${name}}`
      }
      const title = optTitle ? optTitle.slice(1, -1) : ""
      return `:::${name}${title ? `[${title}]` : ""}${labelMatch ? ` {#${labelMatch[1]}}` : ""}\n${bodyWithoutLabel}\n:::`
    })
    // LaTeX commands → shorthands
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "frac($1, $2)")
    .replace(/\\sqrt(?:\[(\d+)\])?\{([^}]+)\}/g, (_full, n, x) => n ? `root(${n}, ${x})` : `sqrt(${x})`)
    .replace(/\\sum_\{([^}]+)\}^\{([^}]+)\}/g, "sum($1, $2)")
    .replace(/\\int_\{([^}]+)\}^\{([^}]+)\}/g, "int($1, $2)")
    .replace(/\\lim_\{([^}]+)\s*\\to\s*([^}]+)\}/g, "lim($1, $2)")
    .replace(/\\vec\{([^}]+)\}/g, "vec($1)")
    .replace(/\\left\|([^}]+)\\right\|/g, "abs($1)")
    .replace(/\\left\\\|([^}]+)\\right\\\|/g, "norm($1)")
    .replace(/\\mathbf\{([^}]+)\}/g, "bf($1)")
    .replace(/\\mathcal\{([^}]+)\}/g, "cal($1)")
    .replace(/\\mathbb\{([^}]+)\}/g, "bb($1)")
    // Labels
    .replace(/\\label\{((?:eq|fig|sec|tbl|thm|theorem|lem|lemma|cor|prop|def|definition|ex|example|exc|exercise):[\w:.-]+)\}/g, "{#$1}")
    .replace(/\\eqref\{(eq:[\w:.-]+)\}/g, "@$1")
    .replace(/\\ref\{((?:fig|sec|tbl|thm|theorem|lem|lemma|cor|prop|def|definition|ex|example|exc|exercise):[\w:.-]+)\}/g, "@$1")
  )
}

// ── Mappings ────────────────────────────────────────────────────────────────

const OBSIDIAN_CALLOUTS: Record<string, string> = {
  theorem: "abstract",
  lemma: "abstract",
  corollary: "abstract",
  proposition: "abstract",
  definition: "note",
  example: "example",
  exercise: "question",
  proof: "success",
  remark: "important",
  note: "note",
  tip: "tip",
  warning: "warning",
  important: "important",
  abstract: "abstract",
  question: "question",
  success: "success",
  info: "info",
}

const OBSIDIAN_TO_CMDX: Record<string, string> = {
  theorem: "theorem",
  lemma: "lemma",
  corollary: "corollary",
  proposition: "proposition",
  definition: "definition",
  example: "example",
  exercise: "exercise",
  proof: "proof",
  remark: "remark",
  note: "note",
  tip: "tip",
  warning: "warning",
  important: "remark",
  abstract: "lemma",
  question: "exercise",
  success: "proof",
  info: "note",
}

const ENV_TITLES: Record<string, string> = {
  theorem: "Theorem",
  lemma: "Lemma",
  corollary: "Corollary",
  proposition: "Proposition",
  definition: "Definition",
  example: "Example",
  exercise: "Exercise",
  proof: "Proof",
  remark: "Remark",
  note: "Note",
  tip: "Tip",
  warning: "Warning",
  folded: "Collapsed",
}

const OBSIDIAN_TITLE_TO_CMDX: Record<string, string> = Object.fromEntries(
  Object.entries(ENV_TITLES).map(([env, title]) => [title, env])
)

const LATEX_ENVS: Record<string, string> = {
  theorem: "theorem",
  lemma: "lemma",
  corollary: "corollary",
  proposition: "proposition",
  definition: "definition",
  example: "example",
  exercise: "exercise",
  proof: "proof",
  remark: "remark",
  note: "note",
  equation: "equation",
  align: "align",
}
