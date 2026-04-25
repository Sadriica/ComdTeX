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

export function replaceMatches(text: string, re: RegExp, replacement: string) {
  const count = countMatches(text, re)
  return {
    count,
    content: count > 0 ? text.replace(re, replacement) : text,
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

export function replaceMatchAt(text: string, re: RegExp, replacement: string, target: SearchReplaceTarget) {
  const start = absoluteIndexFromLineOffset(text, target.line, target.matchStart)
  if (start < 0) return { count: 0, content: text }

  const expectedLength = target.matchEnd - target.matchStart
  const globalRe = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`)
  let match: RegExpExecArray | null

  while ((match = globalRe.exec(text)) !== null) {
    if (match.index === start && match[0].length === expectedLength) {
      const singleRe = new RegExp(re.source, re.flags.replace(/g/g, ""))
      const replaced = match[0].replace(singleRe, replacement)
      return {
        count: 1,
        content: text.slice(0, start) + replaced + text.slice(start + match[0].length),
      }
    }
    if (match[0].length === 0) globalRe.lastIndex++
  }

  return { count: 0, content: text }
}
