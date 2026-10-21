import type { CursorContext } from "./paletteTypes"

/**
 * Where the cursor is, structurally. Computed ONCE when the palette opens (one
 * pass over the lines above the cursor), never on the typing path.
 */

const FENCE_RE = /^\s*(```+|~~~+)/
const BLOCK_OPEN_RE = /^\s*:::\s*([A-Za-z][\w-]*)/
const BLOCK_CLOSE_RE = /^\s*:::\s*$/

function countDisplayFences(line: string): number {
  return (line.match(/\$\$/g) ?? []).length
}

/** Number of unescaped single `$` in `s` (a `$$` pair is not an inline delimiter). */
function countInlineDollars(s: string): number {
  const stripped = s.replace(/\\\$/g, "").replace(/\$\$/g, "")
  return (stripped.match(/\$/g) ?? []).length
}

function rangeAt(
  line: string,
  re: RegExp,
  column: number,
): { start: number; end: number; m: RegExpExecArray } | null {
  const g = new RegExp(re.source, "g")
  let m: RegExpExecArray | null
  const col0 = column - 1
  while ((m = g.exec(line)) !== null) {
    if (col0 >= m.index && col0 <= m.index + m[0].length) {
      return { start: m.index, end: m.index + m[0].length, m }
    }
    if (m[0].length === 0) g.lastIndex++
  }
  return null
}

export function computeCursorContext(
  text: string,
  lineNumber: number,
  column: number,
  hasSelection = false,
): CursorContext {
  const lines = text.split("\n")
  const current = lines[lineNumber - 1] ?? ""
  let inFence = false
  let displayOpen = false
  const stack: { type: string; startLine: number }[] = []

  for (let i = 0; i < lineNumber - 1 && i < lines.length; i++) {
    const line = lines[i]
    if (FENCE_RE.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    if (countDisplayFences(line) % 2 === 1) displayOpen = !displayOpen
    if (displayOpen) continue
    if (BLOCK_CLOSE_RE.test(line)) stack.pop()
    else {
      const open = BLOCK_OPEN_RE.exec(line)
      if (open) stack.push({ type: open[1], startLine: i + 1 })
    }
  }

  let codeFenceHere = inFence
  if (!inFence && FENCE_RE.test(current)) codeFenceHere = true

  // The current line's own opener counts: the cursor on `:::theorem` is in it.
  const block = stack.length ? stack[stack.length - 1] : null
  let blockHere = block
  if (!codeFenceHere && !displayOpen) {
    const open = BLOCK_OPEN_RE.exec(current)
    if (open) blockHere = { type: open[1], startLine: lineNumber }
  }

  const before = current.slice(0, Math.max(0, column - 1))
  let inMath: CursorContext["inMath"] = null
  if (!codeFenceHere) {
    const fencesBefore = countDisplayFences(before)
    if (displayOpen !== (fencesBefore % 2 === 1)) inMath = "display"
    else if (countInlineDollars(before) % 2 === 1) inMath = "inline"
  }

  const label = rangeAt(current, /\{#([\w:.-]+)\}/, column)
  const ref = rangeAt(current, /@(?:[\w/.-]+@)?([a-zA-Z]+:[\w.-]+)/, column)
  const citation = rangeAt(current, /\[@[^\]\n]*\]/, column)
  const gap = rangeAt(current, /\{\{\?[^}\n]*\}\}/, column)

  return {
    lineNumber,
    column,
    line: current,
    hasSelection,
    inMath,
    block: blockHere,
    inCodeFence: codeFenceHere,
    inTable: !codeFenceHere && /^\s*\|/.test(current),
    label: label ? label.m[1] : null,
    ref: ref ? ref.m[1] : null,
    citation: !!citation,
    onGap: !!gap,
  }
}

export interface LineEdit {
  /** 1-based, end exclusive: Monaco's range convention. */
  startColumn: number
  endColumn: number
  text: string
}

/**
 * `$a+b$` under the cursor becomes a `$$` block. Null when the cursor is not
 * inside an inline span on this line.
 */
export function inlineToDisplayEdit(line: string, column: number): LineEdit | null {
  const col0 = column - 1
  const re = /(?<![\\$])\$(?!\$)((?:\\\$|[^$\n])+?)\$(?!\$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line)) !== null) {
    if (col0 >= m.index && col0 <= m.index + m[0].length) {
      const body = m[1].trim()
      const lead = line.slice(0, m.index).trim() ? "\n" : ""
      const trail = line.slice(m.index + m[0].length).trim() ? "\n" : ""
      return {
        startColumn: m.index + 1,
        endColumn: m.index + m[0].length + 1,
        text: `${lead}$$\n${body}\n$$${trail}`,
      }
    }
  }
  return null
}

/** Rewrites the type of a `:::old[Title]{#label}` opener, keeping the rest of the line. */
export function envTypeEdit(openerLine: string, newType: string): LineEdit | null {
  const m = /^(\s*:::\s*)([A-Za-z][\w-]*)/.exec(openerLine)
  if (!m) return null
  const start = m[1].length
  return { startColumn: start + 1, endColumn: start + m[2].length + 1, text: newType }
}
