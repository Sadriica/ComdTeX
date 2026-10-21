/**
 * Shared fuzzy matcher for the command palette, the files mode and the panel
 * filters. Pure: no DOM, no React.
 *
 * Properties the callers rely on:
 * - case and accent insensitive (NFD fold) but `ñ` stays its own letter, the
 *   same rule `PanelSearch.matchesQuery` always had ("indice" finds "índice",
 *   "nino" does not find "niño");
 * - a query is a list of whitespace separated terms, every term must match;
 * - each term is an optimal subsequence alignment (DP, not greedy), scored with
 *   a prefix bonus, a word-boundary bonus (so `scf` finds "Save current file"),
 *   a consecutive-run bonus and an affine gap penalty;
 * - the matched positions come back for highlighting;
 * - fields carry weights (label > keywords > description) and some fields only
 *   count for near-exact queries (category, shortcut).
 */

const MARKS = /[̀-ͯ]/g

/**
 * Fold one character to its search form. Always returns a string of the same
 * UTF-16 length so positions in the folded text index the original text.
 */
function foldChar(ch: string): string {
  if (ch === "ñ" || ch === "Ñ") return "ñ"
  const lower = ch.toLowerCase()
  const folded = lower.normalize("NFD").replace(MARKS, "")
  return folded.length === ch.length ? folded : lower.length === ch.length ? lower : ch
}

/** Lower-case and strip accents (keeping `ñ`), position preserving. */
export function foldText(s: string): string {
  let out = ""
  for (let i = 0; i < s.length; i++) out += foldChar(s[i])
  return out
}

const SEPARATOR = /[\s\-_/\\.:@#()[\]{}|,;>]/

function isLower(c: string): boolean {
  return c !== c.toUpperCase() && c === c.toLowerCase()
}
function isUpper(c: string): boolean {
  return c !== c.toLowerCase() && c === c.toUpperCase()
}

/** How good a place `j` is to start a match: 0 mid-word, higher at word starts. */
function boundaryBonus(orig: string, j: number): number {
  if (j === 0) return 12
  const prev = orig[j - 1]
  if (SEPARATOR.test(prev)) return 10
  if (isLower(prev) && isUpper(orig[j])) return 7
  return 0
}

const MATCH = 16
const CONSECUTIVE = 8
const GAP_START = 6
const GAP_EXTEND = 1
const ACRONYM = 14
const WHOLE_WORD = 20
const NEG = -1e9

interface Prepared {
  orig: string
  folded: string
  bonus: number[]
}

const preparedCache = new Map<string, Prepared>()

function prepare(text: string): Prepared {
  let p = preparedCache.get(text)
  if (!p) {
    if (preparedCache.size > 30000) preparedCache.clear()
    const bonus = new Array<number>(text.length)
    for (let j = 0; j < text.length; j++) bonus[j] = boundaryBonus(text, j)
    p = { orig: text, folded: foldText(text), bonus }
    preparedCache.set(text, p)
  }
  return p
}

export interface FuzzyResult {
  score: number
  /** Indices in the ORIGINAL text of the matched characters, ascending. */
  positions: number[]
}

/** Quick subsequence test used to skip the DP for the (many) non-matches. */
function isSubsequence(q: string, t: string): boolean {
  let qi = 0
  for (let i = 0; i < t.length && qi < q.length; i++) if (t[i] === q[qi]) qi++
  return qi === q.length
}

// Reused DP buffers: matching runs per item per keystroke, so no allocation per call.
let bufSize = 0
let M = new Float64Array(0)
let G = new Float64Array(0)
let fromConsec = new Uint8Array(0)
let gapK = new Int32Array(0)

/** Match ONE term (no whitespace, already folded) against prepared text. */
function matchTerm(q: string, p: Prepared): FuzzyResult | null {
  const t = p.folded
  const m = q.length
  const n = t.length
  if (m === 0) return { score: 0, positions: [] }
  if (m > n || !isSubsequence(q, t)) return null

  // M[i][j]: best score with q[i] matched at t[j]. G[i][j]: best score with q[i]
  // matched at some k <= j, discounted by the gap since (affine). Parent
  // pointers rebuild the positions.
  const size = m * n
  if (size > bufSize) {
    bufSize = Math.max(size, bufSize * 2, 1024)
    M = new Float64Array(bufSize)
    G = new Float64Array(bufSize)
    fromConsec = new Uint8Array(bufSize)
    gapK = new Int32Array(bufSize)
  }
  M.fill(NEG, 0, size)
  G.fill(NEG, 0, size)
  fromConsec.fill(0, 0, size)
  gapK.fill(-1, 0, size)

  for (let i = 0; i < m; i++) {
    const row = i * n
    const prev = row - n
    const qc = q[i]
    for (let j = i; j < n; j++) {
      if (t[j] === qc) {
        const own = MATCH + p.bonus[j]
        if (i === 0) {
          M[row + j] = own
        } else if (j > 0) {
          const consec = M[prev + j - 1] > NEG / 2 ? M[prev + j - 1] + CONSECUTIVE : NEG
          const gap = G[prev + j - 1]
          if (consec >= gap) {
            if (consec > NEG / 2) {
              M[row + j] = own + consec
              fromConsec[row + j] = 1
            }
          } else {
            M[row + j] = own + gap
          }
        }
      }
      // Gap state: carry the best earlier match forward, paying per skipped char.
      const startHere = M[row + j] > NEG / 2 ? M[row + j] - GAP_START : NEG
      const carried = j > 0 && G[row + j - 1] > NEG / 2 ? G[row + j - 1] - GAP_EXTEND : NEG
      if (startHere >= carried) {
        G[row + j] = startHere
        gapK[row + j] = startHere > NEG / 2 ? j : -1
      } else {
        G[row + j] = carried
        gapK[row + j] = gapK[row + j - 1]
      }
    }
  }

  let best = NEG
  let bestJ = -1
  for (let j = m - 1; j < n; j++) {
    if (M[(m - 1) * n + j] > best) {
      best = M[(m - 1) * n + j]
      bestJ = j
    }
  }
  if (bestJ < 0) return null

  const positions = new Array<number>(m)
  let j = bestJ
  for (let i = m - 1; i >= 0; i--) {
    positions[i] = j
    if (i === 0) break
    j = fromConsec[i * n + j] === 1 ? j - 1 : gapK[(i - 1) * n + j - 1]
  }

  let score = best
  // Acronym: every matched char opens a word (`scf` -> Save Current File).
  if (m >= 2 && positions.every((pos) => p.bonus[pos] >= 7)) score += ACRONYM
  // The term is exactly one whole word of the text ("gap" in "Fill gap with AI").
  const first = positions[0]
  const last = positions[m - 1]
  if (
    last - first === m - 1 &&
    p.bonus[first] >= 7 &&
    (last === n - 1 || SEPARATOR.test(p.orig[last + 1]))
  ) {
    score += WHOLE_WORD
  }
  // Scattered mid-word matches are noise: demand some structure.
  const structured = positions.filter(
    (pos, k) => p.bonus[pos] >= 7 || (k > 0 && pos === positions[k - 1] + 1),
  )
  if (m >= 3 && structured.length < Math.ceil(m / 2)) return null
  // Shorter targets are tighter matches.
  score -= n * 0.05
  return { score, positions }
}

/** Fuzzy-match a (possibly multi-term) query against one text. */
export function fuzzyMatch(query: string, text: string): FuzzyResult | null {
  const terms = foldText(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return { score: 0, positions: [] }
  const p = prepare(text)
  let score = 0
  const all = new Set<number>()
  for (const term of terms) {
    const r = matchTerm(term, p)
    if (!r) return null
    score += r.score
    for (const pos of r.positions) all.add(pos)
  }
  return { score, positions: [...all].sort((a, b) => a - b) }
}

export interface FuzzyField {
  text: string | undefined | null
  weight: number
  /**
   * Only counts when the query is (a prefix of) this field as a whole: used for
   * category and shortcut so short queries do not match everything through
   * them.
   */
  exactOnly?: boolean
}

export interface FuzzyScored {
  score: number
  /** Positions inside `fields[0]` (the label), for highlighting. */
  positions: number[]
  /** Index of the field that matched best. */
  field: number
}

function exactMatch(query: string, text: string): boolean {
  const q = foldText(query).replace(/\s+/g, "")
  const t = foldText(text).replace(/\s+/g, "")
  return q.length > 0 && t.startsWith(q)
}

/**
 * Score one item across its weighted fields. Every term must match inside a
 * single field, but different terms may match different fields ("insert cita").
 */
export function fuzzyScore(query: string, fields: FuzzyField[]): FuzzyScored | null {
  const terms = foldText(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return { score: 0, positions: [], field: 0 }
  let total = 0
  let bestField = -1
  let bestFieldScore = -1
  const labelPositions = new Set<number>()
  for (const term of terms) {
    let termBest = -1
    let termField = -1
    let termPositions: number[] = []
    for (let f = 0; f < fields.length; f++) {
      const field = fields[f]
      if (!field.text) continue
      let r: FuzzyResult | null
      if (field.exactOnly) {
        r = exactMatch(term, field.text) ? { score: MATCH * term.length, positions: [] } : null
      } else {
        r = matchTerm(term, prepare(field.text))
      }
      if (!r) continue
      const weighted = r.score * field.weight
      if (weighted > termBest) {
        termBest = weighted
        termField = f
        termPositions = r.positions
      }
    }
    if (termField < 0) return null
    total += termBest
    if (termBest > bestFieldScore) {
      bestFieldScore = termBest
      bestField = termField
    }
    if (termField === 0) for (const pos of termPositions) labelPositions.add(pos)
  }
  return { score: total, positions: [...labelPositions].sort((a, b) => a - b), field: bestField }
}

export interface Ranked<T> {
  item: T
  score: number
  positions: number[]
  field: number
}

/**
 * Rank items against a query, best first. Stable for equal scores (input order
 * wins), so a caller can pre-sort by recency and have it break ties.
 */
export function rankItems<T>(
  items: readonly T[],
  query: string,
  getFields: (item: T) => FuzzyField[],
): Ranked<T>[] {
  const out: (Ranked<T> & { idx: number })[] = []
  items.forEach((item, idx) => {
    const r = fuzzyScore(query, getFields(item))
    if (r) out.push({ item, idx, ...r })
  })
  out.sort((a, b) => b.score - a.score || a.idx - b.idx)
  return out
}

/** Collapse sorted positions into [start, end) runs for rendering `<mark>`s. */
export function positionRanges(positions: readonly number[]): [number, number][] {
  const out: [number, number][] = []
  for (const pos of positions) {
    const last = out[out.length - 1]
    if (last && last[1] === pos) last[1] = pos + 1
    else out.push([pos, pos + 1])
  }
  return out
}

/** Boolean filter with the matcher's folding, for panels that only filter. */
export function fuzzyIncludes(query: string, text: string): boolean {
  return fuzzyMatch(query, text) !== null
}
