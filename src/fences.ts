// Fenced code blocks, as far as the editor's line-by-line helpers need them.

/** True when `lineNumber` sits inside a fenced code block opened on an earlier line. */
export function inFencedCode(getLine: (lineNumber: number) => string, lineNumber: number): boolean {
  let open: { char: string; length: number } | null = null
  for (let n = 1; n < lineNumber; n++) {
    const m = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(getLine(n))
    if (!m) continue
    const char = m[1][0]
    if (!open) {
      // A backtick fence cannot carry a backtick in its info string.
      if (char === "`" && m[2].includes("`")) continue
      open = { char, length: m[1].length }
    } else if (char === open.char && m[1].length >= open.length && m[2].trim() === "") {
      open = null
    }
  }
  return open !== null
}
