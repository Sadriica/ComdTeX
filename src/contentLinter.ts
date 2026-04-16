/**
 * Content linter for ComdTeX documents.
 *
 * Produces Monaco editor markers for:
 *  - Unclosed $$ display-math blocks
 *  - Unclosed ::: environments
 *  - Broken @eq:label cross-references
 *  - Broken [[wikilinks]] (target not in vault)
 *  - Broken [@citation] keys (not in references.bib)
 *  - Shorthand call issues: unclosed parens, wrong arg count
 *
 * Also provides dedicated linters for:
 *  - BibTeX files (.bib): duplicate keys, missing required fields, unknown types
 *  - macros.md: duplicate \newcommand definitions, unbalanced braces
 */

import type * as monacoApi from "monaco-editor"

export interface LintContext {
  /** Base names of vault files, lowercased, without extension. */
  vaultFileNames: Set<string>
  /** Keys defined in references.bib. */
  bibKeys: Set<string>
}

export interface LintSummary {
  errors: number
  warnings: number
}

// Numeric severity values matching Monaco's MarkerSeverity enum.
// Used for background linting without importing Monaco at runtime.
const SEV = { Error: 8, Warning: 4, Info: 2, Hint: 1 } as const

// ── Position helpers ──────────────────────────────────────────────────────────

/** Array of character offsets where each line starts (index 0 → line 1). */
function buildLineIndex(text: string): number[] {
  const idx = [0]
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") idx.push(i + 1)
  }
  return idx
}

/** Binary-search lineIndex for 1-based line + 1-based column. */
function offsetToPos(lineIdx: number[], offset: number): { lineNumber: number; column: number } {
  let lo = 0, hi = lineIdx.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (lineIdx[mid] <= offset) lo = mid
    else hi = mid - 1
  }
  return { lineNumber: lo + 1, column: offset - lineIdx[lo] + 1 }
}

function mkMarker(
  lineIdx: number[],
  start: number,
  end: number,
  message: string,
  severity: monacoApi.MarkerSeverity,
): monacoApi.editor.IMarkerData {
  const s = offsetToPos(lineIdx, start)
  const e = offsetToPos(lineIdx, Math.max(start, end - 1))
  return {
    severity,
    message,
    startLineNumber: s.lineNumber,
    startColumn: s.column,
    endLineNumber: e.lineNumber,
    endColumn: e.column + 1,
  }
}

// ── Strip code regions (preserve offsets — replace chars with spaces) ─────────

/**
 * Replace fenced code blocks (``` … ```) and inline code (`…`) with spaces,
 * preserving newlines so all character offsets stay valid.
 */
function stripCode(text: string): string {
  const buf = Array.from(text)

  // Fenced code blocks: ``` ... ``` (multiline)
  const fenceRe = /^```[^\n]*\n[\s\S]*?^```[ \t]*$/gm
  let m: RegExpExecArray | null
  while ((m = fenceRe.exec(text)) !== null) {
    for (let i = m.index; i < m.index + m[0].length; i++) {
      if (buf[i] !== "\n") buf[i] = " "
    }
  }

  // Inline code: `...`  (single-line only)
  const inlineRe = /`[^`\n]+`/g
  while ((m = inlineRe.exec(text)) !== null) {
    for (let i = m.index; i < m.index + m[0].length; i++) {
      if (buf[i] !== "\n") buf[i] = " "
    }
  }

  return buf.join("")
}

// ── Rule: unclosed $$ display-math ───────────────────────────────────────────

function lintDisplayMath(
  text: string,
  lineIdx: number[],
  Severity: typeof monacoApi.MarkerSeverity,
): monacoApi.editor.IMarkerData[] {
  const markers: monacoApi.editor.IMarkerData[] = []
  const re = /\$\$/g
  let m: RegExpExecArray | null
  let openAt: number | null = null

  while ((m = re.exec(text)) !== null) {
    if (openAt === null) {
      openAt = m.index
    } else {
      openAt = null
    }
  }

  if (openAt !== null) {
    markers.push(mkMarker(lineIdx, openAt, openAt + 2, "Bloque $$ sin cerrar", Severity.Error))
  }
  return markers
}

// ── Rule: unclosed ::: environments ──────────────────────────────────────────

function lintEnvironments(
  text: string,
  lineIdx: number[],
  Severity: typeof monacoApi.MarkerSeverity,
): monacoApi.editor.IMarkerData[] {
  const markers: monacoApi.editor.IMarkerData[] = []
  const lines = text.split("\n")
  const stack: { name: string; offset: number }[] = []
  let offset = 0

  for (const line of lines) {
    const trimmed = line.trim()

    // Opening: :::type or :::type[title] or :::smtype etc.
    const openMatch = /^:::(\w+)/.exec(trimmed)
    if (openMatch) {
      stack.push({ name: openMatch[1], offset })
    } else if (trimmed === ":::") {
      if (stack.length > 0) {
        stack.pop()
      } else {
        markers.push(mkMarker(lineIdx, offset, offset + 3, "Cierre ::: sin entorno abierto", Severity.Warning))
      }
    }

    offset += line.length + 1 // +1 for the \n
  }

  for (const open of stack) {
    markers.push(mkMarker(lineIdx, open.offset, open.offset + 3 + open.name.length,
      `Entorno :::${open.name} sin cerrar`, Severity.Error))
  }

  return markers
}

// ── Rule: broken @eq:label cross-references ───────────────────────────────────

function lintEqRefs(
  text: string,
  lineIdx: number[],
  Severity: typeof monacoApi.MarkerSeverity,
): monacoApi.editor.IMarkerData[] {
  const markers: monacoApi.editor.IMarkerData[] = []

  // Collect all label definitions: {#eq:label} or {#label}
  const defined = new Set<string>()
  const labelRe = /\{#([\w:.-]+)\}/g
  let m: RegExpExecArray | null
  while ((m = labelRe.exec(text)) !== null) defined.add(m[1])

  // Check all @eq:ref usages (skip pure-numeric refs like @eq:1).
  // Dots only allowed mid-label (e.g. @eq:thm.1), not as trailing punctuation.
  const refRe = /@eq:([\w:-]+(?:\.\w+)*)/g
  while ((m = refRe.exec(text)) !== null) {
    const ref = m[1]
    if (/^\d+$/.test(ref)) continue
    // Labels are stored with the full "eq:" prefix (e.g. {#eq:foo} → "eq:foo")
    if (!defined.has(`eq:${ref}`)) {
      markers.push(mkMarker(lineIdx, m.index, m.index + m[0].length,
        `Referencia @eq:${ref} no definida en el documento`, Severity.Warning))
    }
  }

  return markers
}

// ── Rule: broken [[wikilinks]] ────────────────────────────────────────────────

function lintWikilinks(
  text: string,
  lineIdx: number[],
  vaultFileNames: Set<string>,
  Severity: typeof monacoApi.MarkerSeverity,
): monacoApi.editor.IMarkerData[] {
  if (vaultFileNames.size === 0) return [] // vault not loaded yet

  const markers: monacoApi.editor.IMarkerData[] = []
  const re = /\[\[([^\]|#\n]+?)(?:#[^\]|]+?)?(?:\|[^\]\n]+?)?\]\]/g
  let m: RegExpExecArray | null

  while ((m = re.exec(text)) !== null) {
    const target = m[1].trim().toLowerCase()
    if (!vaultFileNames.has(target)) {
      markers.push(mkMarker(lineIdx, m.index, m.index + m[0].length,
        `Wikilink [[${m[1].trim()}]] no encontrado en el vault`, Severity.Warning))
    }
  }
  return markers
}

// ── Rule: broken [@citation] references ──────────────────────────────────────

function lintCitations(
  text: string,
  lineIdx: number[],
  bibKeys: Set<string>,
  Severity: typeof monacoApi.MarkerSeverity,
): monacoApi.editor.IMarkerData[] {
  if (bibKeys.size === 0) return [] // no bib file loaded

  const markers: monacoApi.editor.IMarkerData[] = []
  const re = /\[@([\w:.-]+)(?:,\s*[^\]]*)?\]/g
  let m: RegExpExecArray | null

  while ((m = re.exec(text)) !== null) {
    const key = m[1]
    if (!bibKeys.has(key)) {
      markers.push(mkMarker(lineIdx, m.index, m.index + m[0].length,
        `Cita [@${key}] no encontrada en references.bib`, Severity.Warning))
    }
  }
  return markers
}

// ── Rule: shorthand call issues ───────────────────────────────────────────────

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
    else if (ch === "," && depth === 0) { args.push(current.trim()); current = ""; continue }
    current += ch
  }
  if (current.trim()) args.push(current.trim())
  return args
}

/** Expected argument count per shorthand. null = variadic (no count check). */
const EXPECTED_ARGS: Record<string, number | null> = {
  mat: null, matf: null, table: null,
  frac: 2, sqrt: 1, root: 2, sum: 2, int: 2, lim: 2,
  vec: 1, abs: 1, norm: 1, ceil: 1, floor: 1,
  sup: 2, sub: 2,
  hat: 1, bar: 1, tilde: 1, dot: 1, ddot: 1,
  bf: 1, cal: 1, bb: 1,
  pder: 2, der: 2, inv: 1, trans: 1,
}

const SHORTHAND_NAMES = Object.keys(EXPECTED_ARGS).join("|")
// Negative lookbehind for \ avoids matching \frac( etc. (LaTeX commands)
const SHORTHAND_RE = new RegExp(`(?<!\\\\)\\b(${SHORTHAND_NAMES})\\s*\\(`, "g")

function lintShorthands(
  text: string,
  lineIdx: number[],
  Severity: typeof monacoApi.MarkerSeverity,
): monacoApi.editor.IMarkerData[] {
  const markers: monacoApi.editor.IMarkerData[] = []
  SHORTHAND_RE.lastIndex = 0
  let m: RegExpExecArray | null

  while ((m = SHORTHAND_RE.exec(text)) !== null) {
    const name = m[1]
    const parenStart = m.index + m[0].length - 1
    const balanced = extractBalanced(text, parenStart)

    if (!balanced) {
      markers.push(mkMarker(lineIdx, m.index, m.index + m[0].length,
        `Paréntesis sin cerrar en ${name}(...)`, Severity.Error))
      continue
    }

    const expected = EXPECTED_ARGS[name]
    if (expected !== null) {
      const args = splitArgs(balanced.content).filter((a) => a.length > 0)
      if (args.length > 0 && args.length !== expected) {
        markers.push(mkMarker(lineIdx, m.index, balanced.end,
          `${name}() espera ${expected} argumento${expected === 1 ? "" : "s"}, recibió ${args.length}`,
          Severity.Warning))
      }
    }
  }

  return markers
}

// ── BibTeX linter ─────────────────────────────────────────────────────────────

const BIBTEX_KNOWN_TYPES = new Set([
  "article", "book", "booklet", "conference", "inbook", "incollection",
  "inproceedings", "manual", "mastersthesis", "misc", "phdthesis",
  "proceedings", "techreport", "unpublished",
])
const BIBTEX_SKIP_TYPES = new Set(["string", "preamble", "comment"])

// Each inner array is an OR group — at least one field from the group must be present.
const BIBTEX_REQUIRED: Record<string, string[][]> = {
  article:       [["author"], ["title"], ["journal"], ["year"]],
  book:          [["author", "editor"], ["title"], ["publisher"], ["year"]],
  booklet:       [["title"]],
  conference:    [["author"], ["title"], ["booktitle"], ["year"]],
  inbook:        [["author", "editor"], ["title"], ["chapter", "pages"], ["publisher"], ["year"]],
  incollection:  [["author"], ["title"], ["booktitle"], ["publisher"], ["year"]],
  inproceedings: [["author"], ["title"], ["booktitle"], ["year"]],
  manual:        [["title"]],
  mastersthesis: [["author"], ["title"], ["school"], ["year"]],
  phdthesis:     [["author"], ["title"], ["school"], ["year"]],
  proceedings:   [["title"], ["year"]],
  techreport:    [["author"], ["title"], ["institution"], ["year"]],
  unpublished:   [["author"], ["title"], ["note"]],
}

function lintBibtex(
  text: string,
  lineIdx: number[],
  Severity: typeof monacoApi.MarkerSeverity,
): monacoApi.editor.IMarkerData[] {
  const markers: monacoApi.editor.IMarkerData[] = []
  const seenKeys = new Map<string, number>() // key → offset of first occurrence

  // Find each @type{ or @type( anchor
  const entryRe = /@(\w+)\s*[{(]/g
  let m: RegExpExecArray | null

  while ((m = entryRe.exec(text)) !== null) {
    const type = m[1].toLowerCase()
    if (BIBTEX_SKIP_TYPES.has(type)) continue

    const entryStart = m.index
    const braceStart = entryStart + m[0].length - 1
    const closeChar = text[braceStart] === "{" ? "}" : ")"

    // Walk forward counting braces to find the end of this entry
    let depth = 1
    let i = braceStart + 1
    while (i < text.length && depth > 0) {
      const ch = text[i]
      if (ch === "{" || ch === "(") depth++
      else if (ch === "}" || ch === ")") depth--
      i++
    }

    if (depth !== 0) {
      markers.push(mkMarker(lineIdx, entryStart, entryStart + m[0].length,
        `Entrada @${type} sin cerrar (falta '${closeChar}')`, Severity.Error))
      continue
    }

    const entryBody = text.slice(braceStart + 1, i - 1)

    // Unknown entry type
    if (!BIBTEX_KNOWN_TYPES.has(type)) {
      markers.push(mkMarker(lineIdx, entryStart, entryStart + m[0].length,
        `Tipo de entrada desconocido: @${type}`, Severity.Warning))
      continue
    }

    // Extract citation key (first identifier before the first comma)
    const keyMatch = /^\s*([\w:._-]+)/.exec(entryBody)
    if (!keyMatch) {
      markers.push(mkMarker(lineIdx, entryStart, entryStart + m[0].length,
        `Entrada @${type} sin clave de citación`, Severity.Error))
      continue
    }
    const key = keyMatch[1]
    const keyLower = key.toLowerCase()

    // Duplicate key check
    if (seenKeys.has(keyLower)) {
      markers.push(mkMarker(lineIdx, entryStart, entryStart + m[0].length,
        `Clave duplicada: "${key}" (ya definida antes)`, Severity.Error))
    } else {
      seenKeys.set(keyLower, entryStart)
    }

    // Collect field names defined in this entry.
    // Fields follow the key: fieldname = {value} or fieldname = "value" or fieldname = number
    // We scan for `word =` patterns, skipping content inside braces.
    const presentFields = new Set<string>()
    const fieldsText = entryBody.slice(keyMatch[0].length)
    let fi = 0
    while (fi < fieldsText.length) {
      // Skip whitespace and commas
      if (fieldsText[fi] === "," || fieldsText[fi] === " " || fieldsText[fi] === "\n" ||
          fieldsText[fi] === "\r" || fieldsText[fi] === "\t") { fi++; continue }
      // Try to match a field name followed by =
      const fieldMatch = /^(\w+)\s*=/.exec(fieldsText.slice(fi))
      if (fieldMatch) {
        presentFields.add(fieldMatch[1].toLowerCase())
        fi += fieldMatch[0].length
        // Skip the value (could be {}, "", or a number)
        while (fi < fieldsText.length && fieldsText[fi] !== "{" && fieldsText[fi] !== '"' &&
               !/\d/.test(fieldsText[fi]) && fieldsText[fi] !== ",") fi++
        if (fi < fieldsText.length && fieldsText[fi] === "{") {
          let bd = 0
          while (fi < fieldsText.length) {
            if (fieldsText[fi] === "{") bd++
            else if (fieldsText[fi] === "}") { bd--; if (bd === 0) { fi++; break } }
            fi++
          }
        } else if (fi < fieldsText.length && fieldsText[fi] === '"') {
          fi++ // skip opening "
          while (fi < fieldsText.length && fieldsText[fi] !== '"') fi++
          fi++ // skip closing "
        } else {
          // numeric value
          while (fi < fieldsText.length && /[\d]/.test(fieldsText[fi])) fi++
        }
      } else {
        fi++
      }
    }

    // Check required fields
    const required = BIBTEX_REQUIRED[type]
    if (required) {
      for (const group of required) {
        if (!group.some((f) => presentFields.has(f))) {
          const label = group.length === 1 ? group[0] : group.join(" o ")
          markers.push(mkMarker(lineIdx, entryStart, entryStart + m[0].length,
            `@${type} {${key}}: campo requerido faltante: ${label}`, Severity.Warning))
        }
      }
    }
  }

  return markers
}

// ── Macros linter (macros.md) ─────────────────────────────────────────────────

function lintMacros(
  text: string,
  lineIdx: number[],
  Severity: typeof monacoApi.MarkerSeverity,
): monacoApi.editor.IMarkerData[] {
  const markers: monacoApi.editor.IMarkerData[] = []
  const seenCommands = new Map<string, number>() // command name → first offset

  // Find all \newcommand{\name} occurrences to detect duplicates
  const ncRe = /\\newcommand\{(\\[a-zA-Z]+)\}/g
  let m: RegExpExecArray | null
  while ((m = ncRe.exec(text)) !== null) {
    const name = m[1]
    if (seenCommands.has(name)) {
      markers.push(mkMarker(lineIdx, m.index, m.index + m[0].length,
        `Comando duplicado: ${name} (ya definido antes)`, Severity.Error))
    } else {
      seenCommands.set(name, m.index)
    }
  }

  // Check global brace balance
  let depth = 0
  let lastUnmatched = -1
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") { depth++; lastUnmatched = i }
    else if (text[i] === "}") {
      if (depth === 0) {
        markers.push(mkMarker(lineIdx, i, i + 1, "Llave de cierre } sin abrir", Severity.Error))
      } else {
        depth--
        if (depth === 0) lastUnmatched = -1
      }
    }
  }
  if (depth > 0 && lastUnmatched >= 0) {
    markers.push(mkMarker(lineIdx, lastUnmatched, lastUnmatched + 1,
      "Llave { sin cerrar en macros.md", Severity.Error))
  }

  // Warn about lines that are neither blank, comments, nor \newcommand
  const lines = text.split("\n")
  let offset = 0
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed !== "" && !trimmed.startsWith("%") && !trimmed.startsWith("\\")) {
      markers.push(mkMarker(lineIdx, offset, offset + line.length,
        "Línea no reconocida en macros.md (se esperaba \\newcommand o comentario %)",
        Severity.Warning))
    }
    offset += line.length + 1
  }

  return markers
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Lint a Markdown/LaTeX document (the main editor format).
 */
export function lintContent(
  text: string,
  context: LintContext,
  Severity: typeof monacoApi.MarkerSeverity,
): monacoApi.editor.IMarkerData[] {
  const clean = stripCode(text)
  const lineIdx = buildLineIndex(text)

  return [
    ...lintDisplayMath(clean, lineIdx, Severity),
    ...lintEnvironments(clean, lineIdx, Severity),
    ...lintEqRefs(clean, lineIdx, Severity),
    ...lintWikilinks(clean, lineIdx, context.vaultFileNames, Severity),
    ...lintCitations(clean, lineIdx, context.bibKeys, Severity),
    ...lintShorthands(clean, lineIdx, Severity),
  ]
}

/**
 * Dispatch to the correct linter based on file name.
 *  - *.bib        → BibTeX linter
 *  - macros.md    → Macros linter
 *  - everything else → Markdown/LaTeX content linter
 */
export function lintFile(
  text: string,
  filename: string,
  context: LintContext,
  Severity: typeof monacoApi.MarkerSeverity,
): monacoApi.editor.IMarkerData[] {
  const lineIdx = buildLineIndex(text)
  if (filename.endsWith(".bib")) return lintBibtex(text, lineIdx, Severity)
  if (filename === "macros.md") return lintMacros(text, lineIdx, Severity)
  return lintContent(text, context, Severity)
}

/**
 * Lightweight summary for background linting — does NOT require Monaco at runtime.
 * Uses numeric severity constants that match Monaco's MarkerSeverity enum values.
 */
export function lintFileSummary(
  text: string,
  filename: string,
  context: LintContext,
): LintSummary {
  const markers = lintFile(
    text,
    filename,
    context,
    SEV as unknown as typeof monacoApi.MarkerSeverity,
  )
  return {
    errors: markers.filter((m) => m.severity === SEV.Error).length,
    warnings: markers.filter((m) => m.severity === SEV.Warning).length,
  }
}
