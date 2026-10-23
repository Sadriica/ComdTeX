/**
 * The one rule for spotting `$$` display-math delimiters in editor lines.
 *
 * A closing fence may carry an equation label (`$$ {#eq:gap}`), and a
 * single-line block may too (`$$ x^2 $$ {#eq:sq}`). Matching only a bare
 * `$$` paired a labelled close with the NEXT block's opening fence, so the
 * editor previewed the prose in between as (broken, red) math.
 */

const LABEL_SUFFIX_RE = /\s*\{#[^}\s]+\}\s*$/

/** True for a line that is only a `$$` fence, optionally followed by a label. */
export function isDisplayMathFence(line: string): boolean {
  const t = line.trim()
  if (!t.startsWith("$$")) return false
  return t.slice(2).replace(LABEL_SUFFIX_RE, "").trim() === ""
}

/**
 * The expression of a single-line block (`$$ expr $$` with an optional label),
 * or null when the line is not one.
 */
export function singleLineDisplayMath(line: string): string | null {
  const t = line.trim().replace(LABEL_SUFFIX_RE, "")
  if (!t.startsWith("$$") || !t.endsWith("$$") || t.length <= 4) return null
  const expr = t.slice(2, -2).trim()
  return expr ? expr : null
}
