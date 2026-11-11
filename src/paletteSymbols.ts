// Symbol search for the plain Ctrl+P palette: typing `mu`, `\mu`, `sigma`,
// `suma` or `flecha` finds the glyph. Pure. Matching is deliberately strict
// (exact, then prefix, then word-prefix of a keyword or Spanish name): no
// subsequence matching, which is what buried symbols under noise before.

import { foldText, foldedTerms, LATEX_SPANISH } from "./completion/match"
import { SYMBOLS, type MathSymbol } from "./mathSymbols"

/** Extra names for a command beyond its own keywords (the summation sign is a Sigma). */
const EXTRA_WORDS: Readonly<Record<string, readonly string[]>> = {
  Sigma: ["sum", "suma", "sumatoria", "summation"],
}

interface Entry {
  symbol: MathSymbol
  /** Command name without the backslash. */
  cmd: string
  foldedName: string
  foldedCmd: string
  foldedSpanish: string[]
  /** Whole keyword / Spanish phrases, folded. */
  phrases: string[]
  /** Individual words of the phrases. */
  words: string[]
}

function buildEntry(symbol: MathSymbol): Entry {
  const cmd = symbol.latex.replace(/^\\/, "")
  const foldedSpanish = (LATEX_SPANISH[cmd] ?? []).map(foldText)
  const phrases = [
    ...symbol.keywords.map(foldText),
    ...foldedSpanish,
    ...(EXTRA_WORDS[cmd] ?? []).map(foldText),
  ]
  return {
    symbol,
    cmd,
    foldedName: foldText(symbol.name),
    foldedCmd: foldText(cmd),
    foldedSpanish,
    phrases,
    words: phrases.flatMap((p) => p.split(/\s+/)),
  }
}

const ENTRIES: Entry[] = SYMBOLS.map(buildEntry)

/** Lower is better; null when the entry does not match at all. */
function tier(e: Entry, raw: string, q: string): number | null {
  if (raw === e.symbol.name || raw === e.cmd) return 0
  if (q === e.foldedName || q === e.foldedCmd) return 1
  if (e.foldedSpanish.includes(q)) return 2
  if (e.foldedName.startsWith(q) || e.foldedCmd.startsWith(q)) {
    return e.symbol.name.startsWith(raw) || e.cmd.startsWith(raw) ? 3 : 4
  }
  if (e.phrases.includes(q)) return 5
  if (e.phrases.some((p) => p.startsWith(q)) || e.words.some((w) => w.startsWith(q))) return 6
  return null
}

function normalize(query: string): { raw: string; q: string } | null {
  const raw = query.trim().replace(/^\\/, "")
  if (!raw) return null
  const q = foldedTerms(raw).join(" ")
  return q ? { raw, q } : null
}

/**
 * Symbols matching `query`, best first. Case matters only between exact
 * names (`Sigma` before `sigma` for the capital, the reverse for lowercase).
 */
export function rankSymbols(query: string, limit = 20): MathSymbol[] {
  const n = normalize(query)
  if (!n) return []
  const scored: { e: Entry; t: number; i: number }[] = []
  ENTRIES.forEach((e, i) => {
    const t = tier(e, n.raw, n.q)
    if (t !== null) scored.push({ e, t, i })
  })
  scored.sort((a, b) => a.t - b.t || a.i - b.i)
  return scored.slice(0, limit).map((s) => s.e.symbol)
}

/** True when the query is exactly a symbol's name, command or Spanish name. */
export function isExactSymbolQuery(query: string): boolean {
  const n = normalize(query)
  if (!n) return false
  return ENTRIES.some((e) => {
    const t = tier(e, n.raw, n.q)
    return t !== null && t <= 2
  })
}
