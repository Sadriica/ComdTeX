// The paper reads the pipeline's results.
//
// A computational analysis writes its numbers to a file in the vault (a CSV
// or a JSON). The manuscript quotes them: n, a p-value, an effect size, an
// accuracy. Typed by hand they go stale the day the pipeline reruns, so the
// text holds a REFERENCE instead:
//
//   The difference was significant (val(stats, pvalue, p)), n = val(stats, n).
//   Mean effect: si(val(stats, effect, 3sf), mg/L).
//
// The first argument names a dataset declared with `:::data{#data:stats}`
// (datasets.ts), so one declaration says where the file is and every value
// reads through it. ComdTeX never runs code; it only READS the file.
//
// Grammar, kept small on purpose:
//
//   val(dataset, cell)            cell: A1-style (B4) or a row key (pvalue)
//   val(dataset, rowKey, column)  column: header name, letter or number
//   val(dataset, path)            JSON dataset: dotted path (metrics.auc, folds.0.acc)
//   val(..., format)              3sf | .2f | .2e | p
//
// A1 references count over the dataset the way a spreadsheet shows it: row 1
// is the header line. A row key is matched against the FIRST column; with no
// column given the value comes from the second one (a `metric,value` file).
// A key that looks like a cell (`B4`) is quoted to force the key reading:
// val(stats, "B4").
//
// This module is pure. `expandValueRefs` runs inside `documentResolve.ts`,
// before the preprocessor, so the preview and every export see the same text
// (and `si(val(...), mg/L)` composes: the value is plain text by the time
// `si` runs). Missing things never disappear: they render a visible note.

import { lettersToIndex, resolveColumns, type CsvResolver } from "./csvRange"
import { loadDataset, type DatasetMap } from "./datasets"

// ── Formats ───────────────────────────────────────────────────────────────────

export type ValueFormat =
  | { kind: "sf"; digits: number }
  | { kind: "fixed"; digits: number }
  | { kind: "sci"; digits: number | null }
  | { kind: "p" }

/** `3sf`, `.2f`, `.2e`, `e`, `p`; null when the argument is not a format. */
export function parseValueFormat(arg: string): ValueFormat | null {
  const s = arg.trim().toLowerCase()
  let m = /^(\d{1,2})sf$/.exec(s)
  if (m && parseInt(m[1], 10) >= 1) return { kind: "sf", digits: parseInt(m[1], 10) }
  m = /^\.(\d{1,2})f$/.exec(s)
  if (m) return { kind: "fixed", digits: parseInt(m[1], 10) }
  m = /^\.(\d{1,2})e$/.exec(s)
  if (m) return { kind: "sci", digits: parseInt(m[1], 10) }
  if (s === "e") return { kind: "sci", digits: null }
  if (s === "p") return { kind: "p" }
  return null
}

/** Turn an exponent-form number string into plain digits ("1.23e+5" to "123000"). */
function expandExponent(s: string): string {
  const m = /^(-?)(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(s)
  if (!m) return s
  const [, sign, int, frac = "", expRaw] = m
  const exp = parseInt(expRaw, 10)
  const digits = int + frac
  if (exp >= 0) {
    const pad = Math.max(0, exp + 1 - digits.length)
    const whole = (digits + "0".repeat(pad)).slice(0, exp + 1)
    const rest = digits.slice(exp + 1)
    return `${sign}${whole}${rest ? `.${rest}` : ""}`
  }
  return `${sign}0.${"0".repeat(-exp - 1)}${digits}`
}

function noNegativeZero(s: string): string {
  return /^-0(?:\.0*)?$/.test(s) ? s.slice(1) : s
}

/**
 * Format a numeric cell. Returns null when the text is not a number (the
 * caller turns that into a visible note). `inMath` says whether the result
 * lands inside `$...$`: scientific notation and p-values need math, so
 * outside math they are wrapped in it here.
 */
export function formatValue(text: string, format: ValueFormat, inMath: boolean): string | null {
  const n = Number(text.trim())
  if (text.trim() === "" || !Number.isFinite(n)) return null
  const wrap = (math: string) => (inMath ? math : `$${math}$`)
  switch (format.kind) {
    case "sf":
      return noNegativeZero(expandExponent(n.toPrecision(Math.min(format.digits, 21))))
    case "fixed":
      return noNegativeZero(n.toFixed(Math.min(format.digits, 20)))
    case "sci": {
      const [mantissa, exp] = (
        format.digits === null ? n.toExponential() : n.toExponential(Math.min(format.digits, 20))
      ).split("e")
      const e = parseInt(exp, 10)
      const body = e === 0 ? mantissa : `${mantissa} \\times 10^{${e}}`
      return e === 0 ? mantissa : wrap(body)
    }
    case "p": {
      if (n < 0 || n > 1) return null
      return wrap(n < 0.001 ? "p < 0.001" : `p = ${n.toFixed(3)}`)
    }
  }
}

// ── Finding references in text ────────────────────────────────────────────────

export interface ValueRef {
  /** Offsets of the whole `val(...)` call. */
  start: number
  end: number
  /** The arguments, quotes stripped. */
  args: string[]
  /** True for each argument that was written in quotes. */
  quoted: boolean[]
  /** The call as written, for notes. */
  raw: string
  inMath: boolean
}

const SPECIAL_ENV_RE =
  /^:::(plot|graph|truth|commdiag|pseudocode|flowchart|code)(?:\[[^\]]*\]|\s+\S+)?\s*\n[\s\S]*?^:::\s*$/gm
const FENCED_CODE_RE = /(^|\n)([ \t]{0,3})(```+|~~~+)([^\n]*)\n([\s\S]*?)\n\2\3[ \t]*(?=\n|$)/g
const INLINE_CODE_RE = /(`+)(?!`)([\s\S]+?)\1(?!`)/g
const MATH_RE = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g
const VAL_RE = /(?<![\\\w.])val\s*\(/g

/** Blank out code (keeping offsets) so a documented `val(...)` stays literal. */
function maskLiteral(text: string): string {
  const blank = (s: string) => s.replace(/[^\n]/g, " ")
  return text
    .replace(SPECIAL_ENV_RE, blank)
    .replace(FENCED_CODE_RE, blank)
    .replace(INLINE_CODE_RE, blank)
}

function splitCallArgs(s: string): { args: string[]; quoted: boolean[] } {
  const args: string[] = []
  const quoted: boolean[] = []
  let depth = 0
  let quote = ""
  let cur = ""
  const push = () => {
    const t = cur.trim()
    const q = /^(["']).*\1$/s.test(t) && t.length >= 2
    args.push(q ? t.slice(1, -1) : t)
    quoted.push(q)
    cur = ""
  }
  for (const ch of s) {
    if (quote) {
      if (ch === quote) quote = ""
      cur += ch
      continue
    }
    if (ch === '"' || ch === "'") quote = ch
    if (ch === "(" || ch === "[") depth++
    else if (ch === ")" || ch === "]") depth--
    else if (ch === "," && depth === 0) {
      push()
      continue
    }
    cur += ch
  }
  if (cur.trim() || args.length > 0) push()
  return { args, quoted }
}

/**
 * Every `val(dataset, ...)` call in the text with at least two arguments.
 * One argument is left alone: `val(x)` is far more likely to be math.
 */
export function findValueRefs(text: string): ValueRef[] {
  if (!text.includes("val")) return []
  const masked = maskLiteral(text)
  const mathRanges: Array<[number, number]> = []
  MATH_RE.lastIndex = 0
  let mm: RegExpExecArray | null
  while ((mm = MATH_RE.exec(masked)) !== null) mathRanges.push([mm.index, mm.index + mm[0].length])

  const refs: ValueRef[] = []
  VAL_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = VAL_RE.exec(masked)) !== null) {
    const open = m.index + m[0].length - 1
    let depth = 0
    let close = -1
    for (let i = open; i < masked.length; i++) {
      if (masked[i] === "(") depth++
      else if (masked[i] === ")" && --depth === 0) {
        close = i
        break
      } else if (masked[i] === "\n" && masked[i + 1] === "\n") break
    }
    if (close < 0) continue
    const { args, quoted } = splitCallArgs(text.slice(open + 1, close))
    if (args.length < 2 || args[0] === "") continue
    refs.push({
      start: m.index,
      end: close + 1,
      args,
      quoted,
      raw: text.slice(m.index, close + 1),
      inMath: mathRanges.some(([a, b]) => m!.index > a && m!.index < b),
    })
    VAL_RE.lastIndex = close + 1
  }
  return refs
}

// ── Looking a value up ────────────────────────────────────────────────────────

export type ValueErrorKind =
  "dataset-undeclared" | "source-missing" | "source-unreadable" | "cell-missing" | "not-number"

export interface ValueError {
  kind: ValueErrorKind
  /** The dataset id, file, cell or text the error is about. */
  detail: string
}

export type ValueResult =
  { ok: true; text: string; format: ValueFormat | null } | { ok: false; error: ValueError }

const fail = (kind: ValueErrorKind, detail: string): ValueResult => ({
  ok: false,
  error: { kind, detail },
})

/** `stats`, `data:stats` and `@data:stats` all name the dataset `data:stats`. */
export function valueDatasetLabel(arg: string): string {
  return `data:${arg
    .trim()
    .replace(/^@/, "")
    .replace(/^data:/, "")}`
}

// JSON is parsed once per distinct file content (pointer compare, like the
// CSV cache in datasets.ts) and the cache is bounded.
const jsonCache = new Map<string, { source: string; value: unknown }>()
const JSON_CACHE_MAX = 50

function jsonFor(file: string, resolver: CsvResolver): { value: unknown } | "missing" | "bad" {
  const source = resolver(file)
  if (source == null) return "missing"
  const hit = jsonCache.get(file)
  if (hit && hit.source === source) return { value: hit.value }
  try {
    const value: unknown = JSON.parse(source)
    if (jsonCache.size >= JSON_CACHE_MAX) jsonCache.clear()
    jsonCache.set(file, { source, value })
    return { value }
  } catch {
    return "bad"
  }
}

/** Walk `a.b.0.c` or `a.b[0].c` into a parsed JSON value. */
function walkPath(root: unknown, path: string): unknown {
  const parts = path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter((p) => p !== "")
  let cur: unknown = root
  for (const part of parts) {
    if (cur === null || typeof cur !== "object") return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

const A1_RE = /^([A-Za-z]{1,3})(\d+)$/

/** Resolve one `val(...)` call to the cell text, plus the format asked for. */
export function lookupValue(
  args: readonly string[],
  quoted: readonly boolean[],
  datasets: DatasetMap,
  resolver: CsvResolver,
): ValueResult {
  const label = valueDatasetLabel(args[0])
  const decl = datasets.get(label)
  if (!decl) return fail("dataset-undeclared", label)

  // A trailing format argument is recognised by its shape.
  let rest = args.slice(1)
  let restQuoted = quoted.slice(1)
  let format: ValueFormat | null = null
  const last = rest.length - 1
  if (last >= 0 && !restQuoted[last]) {
    format = parseValueFormat(rest[last])
    if (format) {
      rest = rest.slice(0, last)
      restQuoted = restQuoted.slice(0, last)
    }
  }
  if (rest.length === 0 || rest[0] === "") return fail("cell-missing", args.slice(1).join(", "))

  let text: string
  const file = decl.spec.file
  if (/\.json$/i.test(file)) {
    const parsed = jsonFor(file, resolver)
    if (parsed === "missing") return fail("source-missing", file)
    if (parsed === "bad") return fail("source-unreadable", file)
    const leaf = walkPath(parsed.value, rest[0])
    if (leaf === undefined) return fail("cell-missing", rest[0])
    if (leaf !== null && typeof leaf === "object") return fail("cell-missing", rest[0])
    text = leaf === null ? "" : String(leaf)
  } else {
    const data = loadDataset(decl, resolver)
    if (!data) return fail("source-missing", file)
    const table = [data.header, ...data.rows]
    const a1 = !restQuoted[0] ? A1_RE.exec(rest[0]) : null
    let cell: string | undefined
    if (a1) {
      cell = table[parseInt(a1[2], 10) - 1]?.[lettersToIndex(a1[1])]
    } else {
      const key = rest[0].trim().toLowerCase()
      const row = data.rows.find((r) => (r[0] ?? "").trim().toLowerCase() === key)
      const col = rest.length > 1 ? resolveColumns([rest[1]], data.header)[0] : 1
      cell = row && col !== undefined ? row[col] : undefined
    }
    if (cell === undefined || cell.trim() === "") return fail("cell-missing", rest.join(", "))
    text = cell.trim()
  }

  return { ok: true, text, format }
}

// ── Expansion ─────────────────────────────────────────────────────────────────

/** Text safe to put inside the visible note, in prose or in math. */
function plain(s: string): string {
  return s.replace(/[*_`$\\{}[\]#%&~^]/g, "")
}

function describe(error: ValueError, file: string): string {
  switch (error.kind) {
    case "dataset-undeclared":
      return "no dataset with that name is declared"
    case "source-missing":
      return `${file}: not found in this vault`
    case "source-unreadable":
      return `${file}: could not be read`
    case "cell-missing":
      return `no value at ${error.detail}`
    case "not-number":
      return `"${error.detail}" is not a number`
  }
}

/**
 * Replace every `val(...)` in the text with its value. A reference that
 * cannot be resolved becomes a visible note, never silence. With
 * `leaveUndeclared` a call naming a dataset this text does not declare is
 * kept as written, so a transcluded note can be resolved again against the
 * host document's datasets.
 */
export function expandValueRefs(
  content: string,
  datasets: DatasetMap,
  resolver: CsvResolver,
  opts: { leaveUndeclared?: boolean } = {},
): string {
  const refs = findValueRefs(content)
  if (refs.length === 0) return content
  let out = ""
  let cursor = 0
  for (const ref of refs) {
    out += content.slice(cursor, ref.start)
    cursor = ref.end
    const result = lookupValue(ref.args, ref.quoted, datasets, resolver)
    let replacement: string
    if (!result.ok && result.error.kind === "dataset-undeclared" && opts.leaveUndeclared) {
      replacement = ref.raw
    } else {
      let error: ValueError | null = result.ok ? null : result.error
      let text = result.ok ? result.text : ""
      if (result.ok && result.format) {
        const formatted = formatValue(result.text, result.format, ref.inMath)
        if (formatted === null) error = { kind: "not-number", detail: result.text }
        else text = formatted
      }
      if (error) {
        const file = datasets.get(valueDatasetLabel(ref.args[0]))?.spec.file ?? ""
        const where = plain(ref.args.join(", "))
        const msg = plain(describe(error, file))
        replacement = ref.inMath ? `\\text{[${where}: ${msg}]}` : `*[${where}: ${msg}]*`
      } else {
        replacement = text
      }
    }
    out += replacement
  }
  return out + content.slice(cursor)
}
