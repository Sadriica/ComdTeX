// CSV brought into the document, with spreadsheet-style selection.
//
// A researcher's numbers live in a CSV next to the note; the paper needs a
// slice of it, formatted as a table, and it must stay right when the CSV is
// regenerated. So the document does not hold a copy of the data, it holds a
// SELECTION:
//
//   :::csv[Growth rates]
//   data.csv (A:B, D) (1:8, 12)
//   :::
//
// Columns can be spreadsheet letters (A, B, ... Z, AA), 1-based indices, or
// header names; rows are 1-based over the data rows (the header is not row
// 1, it is the header). Ranges use `:`, and non-contiguous selections are
// grouped in parentheses. Omitting a selector means "everything".
//
// Everything here is pure: parsing the selector, parsing the CSV (RFC 4180
// quoting), and rendering the Markdown table. The file read is injected by
// the caller, exactly like transclusion resolution.

export interface CsvSelection {
  file: string
  /** null means every column. */
  cols: string[] | null
  /** null means every row. */
  rows: string[] | null
}

export interface CsvBlockSpec extends CsvSelection {
  caption: string
}

/** Column letters to a 0-based index: A→0, Z→25, AA→26. */
export function lettersToIndex(letters: string): number {
  let n = 0
  for (const ch of letters.toUpperCase()) {
    if (ch < "A" || ch > "Z") return -1
    n = n * 26 + (ch.charCodeAt(0) - 64)
  }
  return n - 1
}

/** 0-based index to column letters, for error messages and round-trips. */
export function indexToLetters(index: number): string {
  let n = index + 1
  let out = ""
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

/**
 * Split a selector into its atoms: `(A:B, D)` → ["A:B", "D"], `1:8` → ["1:8"].
 * Surrounding parentheses are optional for a single atom.
 */
export function splitSelector(raw: string): string[] {
  const s = raw.trim().replace(/^\((.*)\)$/s, "$1")
  return s
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
}

/**
 * Resolve column atoms against the header row. Returns 0-based indices in
 * the order written, so `(D, A)` really does put D first: the selection is
 * also a reordering.
 */
export function resolveColumns(atoms: string[] | null, header: string[]): number[] {
  if (!atoms) return header.map((_, i) => i)
  const out: number[] = []
  const push = (i: number) => {
    if (i >= 0 && i < header.length && !out.includes(i)) out.push(i)
  }
  for (const atom of atoms) {
    const range = /^([A-Za-z]+|\d+)\s*:\s*([A-Za-z]+|\d+)$/.exec(atom)
    if (range) {
      const a = columnAtomToIndex(range[1], header)
      const b = columnAtomToIndex(range[2], header)
      if (a < 0 || b < 0) continue
      const [lo, hi] = a <= b ? [a, b] : [b, a]
      for (let i = lo; i <= hi; i++) push(i)
      continue
    }
    push(columnAtomToIndex(atom, header))
  }
  return out
}

function columnAtomToIndex(atom: string, header: string[]): number {
  const trimmed = atom.trim()
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10) - 1
  if (/^[A-Za-z]+$/.test(trimmed)) {
    // A bare word can be a column letter or a header name. The header wins
    // when it matches, so a CSV with a column literally named "A" behaves
    // the way the author expects.
    const byName = header.findIndex((h) => h.trim().toLowerCase() === trimmed.toLowerCase())
    if (byName >= 0) return byName
    return lettersToIndex(trimmed)
  }
  const byName = header.findIndex((h) => h.trim().toLowerCase() === trimmed.toLowerCase())
  return byName
}

/** Resolve row atoms to 0-based data-row indices, in the order written. */
export function resolveRows(atoms: string[] | null, rowCount: number): number[] {
  if (!atoms) return Array.from({ length: rowCount }, (_, i) => i)
  const out: number[] = []
  const push = (i: number) => {
    if (i >= 0 && i < rowCount && !out.includes(i)) out.push(i)
  }
  for (const atom of atoms) {
    const range = /^(\d+)\s*:\s*(\d+)$/.exec(atom)
    if (range) {
      const a = parseInt(range[1], 10) - 1
      const b = parseInt(range[2], 10) - 1
      const [lo, hi] = a <= b ? [a, b] : [b, a]
      for (let i = lo; i <= hi; i++) push(i)
      continue
    }
    if (/^\d+$/.test(atom)) push(parseInt(atom, 10) - 1)
  }
  return out
}

/** RFC 4180 parsing: quoted fields, escaped quotes, embedded newlines. */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const delim = delimiter ?? sniffDelimiter(text)
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += ch
      continue
    }
    if (ch === '"') { inQuotes = true; continue }
    if (ch === delim) { row.push(field); field = ""; continue }
    if (ch === "\r") continue
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue }
    field += ch
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.length > 1 || r[0] !== "")
}

/** Pick the delimiter by counting candidates in the first line. */
export function sniffDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ""
  const counts = [",", ";", "\t", "|"].map((d) => [d, firstLine.split(d).length - 1] as const)
  counts.sort((a, b) => b[1] - a[1])
  return counts[0][1] > 0 ? counts[0][0] : ","
}

/**
 * Parse a block body into a spec. The first non-empty line carries the
 * whole selection; `key: value` lines are also accepted for readability.
 */
export function parseCsvBlock(body: string, caption = ""): CsvBlockSpec | null {
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return null

  // Key/value form
  if (lines.every((l) => /^[a-z]+\s*:/i.test(l))) {
    const map: Record<string, string> = {}
    for (const l of lines) {
      const i = l.indexOf(":")
      map[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim()
    }
    if (!map.file) return null
    return {
      file: map.file,
      cols: map.cols ? splitSelector(map.cols) : null,
      rows: map.rows ? splitSelector(map.rows) : null,
      caption,
    }
  }

  // Compact form: file (cols) (rows)
  const line = lines[0]
  const groups = [...line.matchAll(/\(([^)]*)\)/g)].map((m) => m[1])
  const filePart = line.replace(/\([^)]*\)/g, "").trim()
  const file = filePart.split(/\s+/)[0] ?? ""
  if (!file) return null

  if (groups.length > 0) {
    return {
      file,
      cols: groups[0]?.trim() ? splitSelector(groups[0]) : null,
      rows: groups[1]?.trim() ? splitSelector(groups[1]) : null,
      caption,
    }
  }
  // No parentheses: bare selectors after the filename, e.g. `data.csv A:B 1:8`
  const rest = filePart.split(/\s+/).slice(1)
  const cols = rest.find((r) => /[A-Za-z]/.test(r)) ?? null
  const rows = rest.find((r) => /^\d/.test(r)) ?? null
  return {
    file,
    cols: cols ? splitSelector(cols) : null,
    rows: rows ? splitSelector(rows) : null,
    caption,
  }
}

/** Apply a selection to parsed CSV rows: returns header plus selected rows. */
export function selectCsv(
  table: string[][],
  spec: Pick<CsvSelection, "cols" | "rows">,
): { header: string[]; rows: string[][] } {
  if (table.length === 0) return { header: [], rows: [] }
  const header = table[0]
  const dataRows = table.slice(1)
  const colIdx = resolveColumns(spec.cols, header)
  const rowIdx = resolveRows(spec.rows, dataRows.length)
  return {
    header: colIdx.map((c) => header[c] ?? ""),
    rows: rowIdx.map((r) => colIdx.map((c) => dataRows[r]?.[c] ?? "")),
  }
}

/** Escape a cell so pipes and newlines cannot break the Markdown table. */
function escapeCell(v: string): string {
  return v.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim()
}

/** Render the selection as a Markdown table, optionally labeled. */
export function csvToMarkdownTable(
  header: string[],
  rows: string[][],
  opts: { caption?: string; label?: string } = {},
): string {
  if (header.length === 0) return ""
  const lines = [
    `| ${header.map(escapeCell).join(" | ")} |`,
    `|${header.map(() => "---").join("|")}|`,
    ...rows.map((r) => `| ${r.map(escapeCell).join(" | ")} |`),
  ]
  if (opts.label) lines.push(`{#${opts.label}}`)
  if (opts.caption) lines.unshift(`**${escapeCell(opts.caption)}**`, "")
  return lines.join("\n")
}

/** Whole pipeline: raw CSV text plus a spec becomes a Markdown table. */
export function renderCsvSelection(csvText: string, spec: CsvBlockSpec): string {
  const table = parseCsv(csvText)
  const { header, rows } = selectCsv(table, spec)
  return csvToMarkdownTable(header, rows, { caption: spec.caption })
}

// ── Block expansion ───────────────────────────────────────────────────────────

/** Reads a vault file by name or path; the same shape transclusion uses. */
export type CsvResolver = (target: string) => string | null

const CSV_BLOCK_RE = /^:::csv(?:\[([^\]]*)\])?[ \t]*\r?\n([\s\S]*?)^:::[ \t]*$/gm

/**
 * Replace every `:::csv` block with the Markdown table its selection
 * describes. A missing file or an unparseable selection leaves an honest
 * note in place of the table: silence would look like a rendering bug.
 */
export function expandCsvBlocks(content: string, resolver?: CsvResolver): string {
  if (!resolver || !content.includes(":::csv")) return content
  return content.replace(CSV_BLOCK_RE, (full, caption: string | undefined, body: string) => {
    const spec = parseCsvBlock(body, caption ?? "")
    if (!spec) return full
    const csvText = resolver(spec.file)
    if (csvText == null) return `**${spec.caption || "CSV"}**\n\n*(${spec.file}: not found in this vault)*`
    try {
      const table = renderCsvSelection(csvText, spec)
      return table || `**${spec.caption || "CSV"}**\n\n*(${spec.file}: empty selection)*`
    } catch {
      return `**${spec.caption || "CSV"}**\n\n*(${spec.file}: could not be read as CSV)*`
    }
  })
}
