import { foldText, rankItems } from "./fuzzy"
import type { T } from "./i18n"
import type { FileEntry, RankedFile } from "./paletteSources"
import { SETTINGS_INDEX, type SettingsEntry, type SettingsSectionId } from "./settingsIndex"

/**
 * What the unprefixed (files) query adds beyond file names: typo tolerance when
 * nothing matched, and settings found by name. Pure, like paletteSources.
 */

// ── Typos in the files mode ─────────────────────────────────────────────────

/** Optimal-string-alignment distance (insert, delete, replace, swap), capped. */
export function editDistance(a: string, b: string, cap: number): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1
  const rows: number[][] = []
  for (let i = 0; i <= a.length; i++) {
    rows.push(new Array<number>(b.length + 1).fill(0))
    rows[i][0] = i
  }
  for (let j = 0; j <= b.length; j++) rows[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    let rowMin = cap + 1
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, rows[i - 2][j - 2] + 1)
      }
      rows[i][j] = v
      if (v < rowMin) rowMin = v
    }
    if (rowMin > cap) return cap + 1
  }
  return rows[a.length][b.length]
}

const TYPO_SCAN_LIMIT = 12000

const stemWords = new WeakMap<FileEntry, string[]>()

function wordsOf(e: FileEntry): string[] {
  let w = stemWords.get(e)
  if (!w) {
    const stem = e.name.replace(/\.[^./]+$/, "")
    const spaced = stem.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    w = [foldText(stem), ...foldText(spaced).split(/[\s\-_.]+/)].filter((x) => x.length >= 3)
    stemWords.set(e, w)
  }
  return w
}

/**
 * Last resort when nothing matched: files whose name (or one of its words) is
 * within one or two typos of EVERY term of the query ("itroduction" for
 * "introduction"). Terms under four letters are never guessed.
 */
export function typoFileMatches(entries: readonly FileEntry[], query: string): RankedFile[] {
  const terms = foldText(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0 || terms.some((t) => t.length < 4)) return []
  // A guess that has to read this many names would be felt on every keystroke.
  if (entries.length > TYPO_SCAN_LIMIT) return []
  const out: { entry: FileEntry; dist: number }[] = []
  for (const entry of entries) {
    let total = 0
    let ok = true
    for (const term of terms) {
      const cap = term.length >= 8 ? 2 : 1
      let best = cap + 1
      for (const w of wordsOf(entry)) {
        const d = editDistance(term, w, cap)
        if (d < best) best = d
        // A prefix typed with a typo ("intrd" for "introduction").
        if (w.length > term.length) {
          const dp = editDistance(term, w.slice(0, term.length), cap)
          if (dp < best) best = dp
        }
      }
      if (best > cap) {
        ok = false
        break
      }
      total += best
    }
    if (ok) out.push({ entry, dist: total })
  }
  out.sort((a, b) => a.dist - b.dist || a.entry.rel.localeCompare(b.entry.rel))
  return out.map((r) => ({ entry: r.entry, positions: [], recent: false }))
}

// ── Settings by name ────────────────────────────────────────────────────────

export interface RankedSetting {
  entry: SettingsEntry
  label: string
  positions: number[]
}

export function rankSettingEntries(query: string, t: T): RankedSetting[] {
  return rankItems(SETTINGS_INDEX, query, (e) => [{ text: e.label(t), weight: 1 }]).map((r) => ({
    entry: r.item,
    label: r.item.label(t),
    positions: r.positions,
  }))
}

/** Tab title of a settings section, for the dim text of a setting row. */
export function settingSectionName(section: SettingsSectionId, t: T): string {
  return section === "ai" ? t.aiSettings.section : t.settings.sections[section]
}
