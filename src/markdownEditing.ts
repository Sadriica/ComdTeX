/**
 * Pure editing helpers for Markdown structure (lists, task items, pipe tables).
 *
 * These live outside `monacoSetup.ts` so they can be unit-tested without a
 * Monaco instance. `monacoSetup.ts` wires them to the editor's Enter key, and
 * the "normalise table" command reuses the same table primitives: one parser,
 * so the linter, the command and Enter can never disagree about what a row is.
 *
 * Monaco's declarative `onEnterRules` are deliberately NOT used for this: they
 * can only append a constant string, so they cannot increment an ordered list,
 * count a table's columns, or clear a marker the user abandoned. Everything is
 * resolved here and applied by the explicit Enter handler in `monacoSetup.ts`.
 */

/** Indent + bullet/number + optional task box, followed by the item's text. */
const LIST_ITEM_RE = /^([ \t]*)([-*+]|\d+[.)])([ \t]+)(\[[ xX]\][ \t]+)?(.*)$/

/** Indent + one or more `>` markers, followed by the quoted text. */
const BLOCKQUOTE_RE = /^([ \t]*)((?:>[ \t]?)+)(.*)$/

/** A line that looks like a pipe-table row: starts with `|` and holds another `|`. */
const TABLE_ROW_RE = /^[ \t]*\|.*\|[ \t]*$/

/** A GFM alignment row: `|---|:--:|`; cells are only dashes/colons. */
const TABLE_DELIM_CELL_RE = /^[ \t]*:?-+:?[ \t]*$/

export type EnterOverride =
  /** Replace the current line outright; no newline is inserted. */
  | { kind: "replaceLine"; text: string }
  /** Insert a newline followed by `text`. */
  | { kind: "insertLine"; text: string }

/**
 * Split a pipe-table row into its cells, dropping the leading/trailing pipe.
 * Escaped pipes (`\|`) stay inside their cell: they are literal content.
 */
export function splitTableRow(line: string): string[] {
  const trimmed = line.trim()
  if (!TABLE_ROW_RE.test(line)) return []
  const inner = trimmed.slice(1, -1)
  const cells: string[] = []
  let current = ""
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]
    if (ch === "\\" && inner[i + 1] === "|") {
      current += "\\|"
      i++
    } else if (ch === "|") {
      cells.push(current)
      current = ""
    } else {
      current += ch
    }
  }
  cells.push(current)
  return cells
}

/** True for the `|---|---|` alignment row under a table header. */
export function isTableDelimiterRow(line: string): boolean {
  const cells = splitTableRow(line)
  return cells.length > 0 && cells.every((c) => TABLE_DELIM_CELL_RE.test(c))
}

/** Drop one indentation level (a tab, or up to `tabSize` spaces). */
function outdent(indent: string, tabSize: number): string {
  if (indent.endsWith("\t")) return indent.slice(0, -1)
  return indent.slice(0, Math.max(0, indent.length - tabSize))
}

/**
 * What Enter should do on `lineText`. Returns null when Monaco's default Enter
 * is correct (ordinary prose), so the caller can simply not intervene.
 *
 * Only call this with the cursor at the end of the line; splitting a row or a
 * list marker in the middle must keep Monaco's normal Enter.
 */
export function resolveEnterOverride(lineText: string, tabSize = 2): EnterOverride | null {
  // ── List items (bullet, ordered, task) ──────────────────────────────────
  const item = LIST_ITEM_RE.exec(lineText)
  if (item) {
    const [, indent, marker, space, task, text] = item
    // Abandoned marker: outdent one level, or clear it outright at the top.
    // Without this, leaving a list means selecting and deleting the stray "- ".
    if (text.trim() === "") {
      return indent.length === 0
        ? { kind: "replaceLine", text: "" }
        : { kind: "replaceLine", text: `${outdent(indent, tabSize)}${marker}${space}${task ?? ""}` }
    }
    const ordered = /^(\d+)([.)])$/.exec(marker)
    const nextMarker = ordered
      ? `${Number(ordered[1]) + 1}${ordered[2]}`
      : marker
    // A task item continues as an UNCHECKED box regardless of the current one.
    const nextTask = task ? "[ ] " : ""
    return { kind: "insertLine", text: `${indent}${nextMarker}${space}${nextTask}` }
  }

  // ── Blockquotes ─────────────────────────────────────────────────────────
  const quote = BLOCKQUOTE_RE.exec(lineText)
  if (quote) {
    const [, indent, markers, text] = quote
    if (text.trim() === "") return { kind: "replaceLine", text: "" }
    return { kind: "insertLine", text: `${indent}${markers}` }
  }

  // ── Pipe table → a fresh row with the same column count. ────────────────
  const cells = splitTableRow(lineText)
  if (cells.length > 1) {
    const indent = /^[ \t]*/.exec(lineText)?.[0] ?? ""
    // An already-blank row means "I'm done with this table": clear it instead of
    // adding yet another empty row.
    if (!isTableDelimiterRow(lineText) && cells.every((c) => c.trim() === "")) {
      return { kind: "replaceLine", text: "" }
    }
    const blank = `${indent}|${cells.map(() => "   ").join("|")}|`
    return { kind: "insertLine", text: blank }
  }

  return null
}

/**
 * Pad every row of a pipe table to the header's column count and re-align the
 * pipes. Rows with *more* cells than the header keep them; silently dropping a
 * user's content would be worse than a ragged table.
 *
 * `lines` must be the contiguous table block (header, delimiter, body).
 */
export function normalizeTableBlock(lines: string[]): string[] {
  const rows = lines.map(splitTableRow)
  if (rows.length === 0 || rows.some((r) => r.length === 0)) return lines

  const width = Math.max(...rows.map((r) => r.length))
  const delimIdx = lines.findIndex(isTableDelimiterRow)
  const padded = rows.map((r) => [...r, ...Array(width - r.length).fill("")])

  // Column width = widest non-delimiter cell, so the delimiter row stretches to
  // the content rather than the content shrinking to a 3-dash delimiter.
  const colWidth = Array.from({ length: width }, (_, c) =>
    Math.max(3, ...padded.map((r, i) => (i === delimIdx ? 0 : r[c].trim().length))),
  )

  const indent = /^[ \t]*/.exec(lines[0])?.[0] ?? ""
  return padded.map((cells, i) => {
    if (i === delimIdx) {
      // Preserve each column's alignment colons while resizing the dashes.
      const body = cells.map((cell, c) => {
        const left = cell.trim().startsWith(":")
        const right = cell.trim().endsWith(":")
        const dashes = "-".repeat(Math.max(3, colWidth[c] - (left ? 1 : 0) - (right ? 1 : 0)))
        return ` ${left ? ":" : ""}${dashes}${right ? ":" : ""} `
      })
      return `${indent}|${body.join("|")}|`
    }
    return `${indent}|${cells.map((cell, c) => ` ${cell.trim().padEnd(colWidth[c])} `).join("|")}|`
  })
}

/**
 * The contiguous run of table rows containing `lineIndex`, or null if that line
 * is not part of a pipe table. Shared by the linter and the normalise command.
 */
export function findTableBlock(lines: string[], lineIndex: number): { start: number; end: number } | null {
  if (!TABLE_ROW_RE.test(lines[lineIndex] ?? "")) return null
  let start = lineIndex
  while (start > 0 && TABLE_ROW_RE.test(lines[start - 1])) start--
  let end = lineIndex
  while (end < lines.length - 1 && TABLE_ROW_RE.test(lines[end + 1])) end++
  return { start, end }
}

/**
 * 1-indexed start lines of every `:::type` block whose type is in `types`.
 *
 * Used to auto-collapse `:::excalidraw` the first time a file is opened: its
 * scene is a single base64 line that word-wraps into dozens of screen lines and
 * buries the surrounding prose.
 */
export function findSpecialBlockStarts(lines: string[], types: readonly string[]): number[] {
  const wanted = new Set(types)
  const starts: number[] = []
  let depth = 0
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    const open = /^:::([A-Za-z][\w-]*)/.exec(trimmed)
    if (open) {
      // Only top-level blocks: a nested open inside an unclosed block would
      // otherwise be reported as its own foldable region.
      if (depth === 0 && wanted.has(open[1])) starts.push(i + 1)
      depth++
    } else if (trimmed === ":::" && depth > 0) {
      depth--
    }
  }
  return starts
}

export interface DocumentSection {
  /** Heading text, without the leading hashes. */
  title: string
  level: number
  /** 1-indexed inclusive line range covering the heading and its body. */
  start: number
  end: number
  /** The section's full text, heading line included. */
  text: string
}

/**
 * Split a document into the sections at `level`, plus whatever precedes the
 * first one. Used by the "split into files" command for long per-subject notes.
 *
 * Content before the first heading of that level is returned as `preamble`:
 * it belongs to the original document (frontmatter, an intro) and must not be
 * silently attached to the first section or dropped.
 */
export function splitIntoSections(text: string, level: number): {
  preamble: string
  sections: DocumentSection[]
} {
  const lines = text.split("\n")
  const starts: { title: string; level: number; line: number }[] = []
  let inFence = false
  let fenceMarker = ""

  lines.forEach((raw, i) => {
    const line = raw.trim()
    const fence = /^(```+|~~~+)/.exec(line)
    if (fence) {
      if (!inFence) { inFence = true; fenceMarker = fence[1][0] }
      else if (fence[1][0] === fenceMarker) { inFence = false }
      return
    }
    if (inFence) return
    const heading = /^(#{1,6})\s+(\S.*)$/.exec(line)
    if (heading && heading[1].length === level) {
      starts.push({ title: heading[2].trim(), level, line: i + 1 })
    }
  })

  if (starts.length === 0) return { preamble: text, sections: [] }

  const preamble = lines.slice(0, starts[0].line - 1).join("\n")
  const sections = starts.map((h, idx) => {
    const end = idx + 1 < starts.length ? starts[idx + 1].line - 1 : lines.length
    return {
      title: h.title,
      level: h.level,
      start: h.line,
      end,
      text: lines.slice(h.line - 1, end).join("\n"),
    }
  })
  return { preamble, sections }
}

/**
 * Filename-safe slug for a section title: lowercase, accents folded, spaces to
 * hyphens. Falls back to `seccion-N` when a title yields nothing usable (for
 * example a heading that is only punctuation or math).
 */
export function sectionSlug(title: string, index: number): string {
  const slug = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || `seccion-${index + 1}`
}

/** A foldable region, in 1-indexed line numbers (inclusive). */
export interface FoldRange {
  start: number
  end: number
  /** "block" for a `:::…:::` block, "heading" for a markdown section. */
  kind: "block" | "heading"
}

/**
 * Foldable regions of a markdown document: `:::` blocks and heading sections.
 *
 * Heading folding is what makes a single long subject file workable: a section
 * runs from its heading to just before the next heading of the same or higher
 * level, so collapsing "Clase 3" hides that class and nothing else.
 *
 * Fenced code is skipped: a `# comment` inside a shell snippet is not a heading,
 * and treating it as one would fold the rest of the document into it.
 */
export function computeFoldRanges(lines: string[]): FoldRange[] {
  const ranges: FoldRange[] = []
  const blockStack: number[] = []
  /** Open headings, innermost last. */
  const headingStack: { level: number; start: number }[] = []
  let inFence = false
  let fenceMarker = ""

  const closeHeadingsTo = (level: number, endLine: number) => {
    while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
      const open = headingStack.pop()!
      // A one-line section has nothing to hide.
      if (endLine > open.start) ranges.push({ start: open.start, end: endLine, kind: "heading" })
    }
  }

  lines.forEach((raw, i) => {
    const line = raw.trim()
    const lineNo = i + 1

    const fence = /^(```+|~~~+)/.exec(line)
    if (fence) {
      if (!inFence) { inFence = true; fenceMarker = fence[1][0] }
      else if (fence[1][0] === fenceMarker) { inFence = false }
      return
    }
    if (inFence) return

    if (/^:::[\w]/.test(line)) {
      blockStack.push(lineNo)
      return
    }
    if (line === ":::") {
      const start = blockStack.pop()
      if (start !== undefined) ranges.push({ start, end: lineNo, kind: "block" })
      return
    }

    const heading = /^(#{1,6})\s+\S/.exec(line)
    if (heading) {
      const level = heading[1].length
      // The previous section ends on the line before this heading.
      closeHeadingsTo(level, lineNo - 1)
      headingStack.push({ level, start: lineNo })
    }
  })

  // Everything still open runs to the end of the document.
  closeHeadingsTo(1, lines.length)
  return ranges
}

/**
 * Rows whose cell count differs from the header's. markdown-it silently drops
 * the extra cells (or leaves the row short), so the preview quietly disagrees
 * with the source: worth a warning.
 *
 * Returns line indices relative to `lines`.
 */
export function raggedTableRows(lines: string[]): { line: number; expected: number; actual: number }[] {
  const out: { line: number; expected: number; actual: number }[] = []
  const seen = new Set<number>()
  for (let i = 0; i < lines.length; i++) {
    if (seen.has(i)) continue
    const block = findTableBlock(lines, i)
    if (!block) continue
    for (let n = block.start; n <= block.end; n++) seen.add(n)
    const expected = splitTableRow(lines[block.start]).length
    for (let n = block.start + 1; n <= block.end; n++) {
      const actual = splitTableRow(lines[n]).length
      if (actual !== expected) out.push({ line: n, expected, actual })
    }
  }
  return out
}
