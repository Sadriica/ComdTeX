// Enter on a `:::type` opening line closes the block.
//
// The Enter key has ONE handler (`setupEditorCommands` in monacoSetup.ts, next
// to list continuation); this module only decides, it does not listen.

const OPENER = /^:::(?:sm\s+|lg\s+)?[A-Za-z][\w-]*(?:\[[^\]]*\])?\s*(?:\{#[\w:.-]+\})?\s*$/
const OPENS = /^:::(?:sm\s+|lg\s+)?[A-Za-z][\w-]*/

export interface BlockCloserEdit {
  /** Text to insert at the end of the opening line (starts with the line break). */
  text: string
  /** Where the caret goes: the empty line between the fences. */
  caretLine: number
}

/**
 * When the cursor is at the end of an opening fence that nothing closes yet,
 * returns the edit that adds the closing `:::` on its own line and leaves the
 * caret on the empty line in between. Null when Enter should behave normally.
 */
export function resolveBlockCloserEnter(
  getLine: (lineNumber: number) => string,
  lineCount: number,
  lineNumber: number,
  column: number,
  eol: string,
): BlockCloserEdit | null {
  const line = getLine(lineNumber)
  if (column !== line.length + 1 || !OPENER.test(line.trim())) return null

  // Walk forward: a bare `:::` at depth zero already closes this block.
  let depth = 0
  for (let n = lineNumber + 1; n <= lineCount; n++) {
    const next = getLine(n).trim()
    if (next === ":::") {
      if (depth === 0) return null
      depth--
    } else if (OPENS.test(next)) {
      depth++
    }
  }
  return { text: `${eol}${eol}:::`, caretLine: lineNumber + 1 }
}
