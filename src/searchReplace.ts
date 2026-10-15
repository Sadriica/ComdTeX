export interface SearchReplaceOptions {
  caseSensitive?: boolean
  wholeWord?: boolean
  regex?: boolean
}

export function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function buildSearchRegExp(query: string, opts: SearchReplaceOptions = {}): RegExp | null {
  if (!query) return null
  try {
    let pattern = opts.regex ? query : escapeRegex(query)
    if (opts.wholeWord) pattern = `\\b${pattern}\\b`
    return new RegExp(pattern, opts.caseSensitive ? "g" : "gi")
  } catch {
    return null
  }
}

export function countMatches(text: string, re: RegExp): number {
  const globalRe = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`)
  return text.match(globalRe)?.length ?? 0
}

/**
 * What to hand to String.replace. In regex mode the user's replacement may use
 * the group tokens (dollar-1, dollar-ampersand, ...), so the string goes
 * through unchanged. In literal mode a replacement string would STILL be
 * interpreted (dollar-ampersand inserts the match, a double dollar collapses
 * to one), silently corrupting text such as LaTeX math or prices; a function
 * replacer inserts exactly what the user typed.
 */
export function replaceWith(text: string, re: RegExp, replacement: string, opts?: SearchReplaceOptions): string {
  // No options at all keeps the old string semantics for old callers; every
  // real call site passes the user's options and gets literal mode.
  return !opts || opts.regex ? text.replace(re, replacement) : text.replace(re, () => replacement)
}

export function replaceMatches(text: string, re: RegExp, replacement: string, opts?: SearchReplaceOptions) {
  const count = countMatches(text, re)
  return {
    count,
    content: count > 0 ? replaceWith(text, re, replacement, opts) : text,
  }
}

export interface SearchReplaceTarget {
  line: number
  matchStart: number
  matchEnd: number
}

function absoluteIndexFromLineOffset(text: string, line: number, offset: number): number {
  if (line < 1) return -1
  const lines = text.split("\n")
  if (line > lines.length || offset < 0 || offset > lines[line - 1].length) return -1
  return lines.slice(0, line - 1).reduce((sum, current) => sum + current.length + 1, 0) + offset
}

export function replaceMatchAt(text: string, re: RegExp, replacement: string, target: SearchReplaceTarget, opts?: SearchReplaceOptions) {
  const start = absoluteIndexFromLineOffset(text, target.line, target.matchStart)
  if (start < 0) return { count: 0, content: text }

  const expectedLength = target.matchEnd - target.matchStart
  const globalRe = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`)
  let match: RegExpExecArray | null

  while ((match = globalRe.exec(text)) !== null) {
    if (match.index === start && match[0].length === expectedLength) {
      const singleRe = new RegExp(re.source, re.flags.replace(/g/g, ""))
      const replaced = replaceWith(match[0], singleRe, replacement, opts)
      return {
        count: 1,
        content: text.slice(0, start) + replaced + text.slice(start + match[0].length),
      }
    }
    if (match[0].length === 0) globalRe.lastIndex++
  }

  return { count: 0, content: text }
}
